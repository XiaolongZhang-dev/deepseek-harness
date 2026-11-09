#!/usr/bin/env python3
"""Build the local Dev copy of DeepSeek Harness with a stable, unique identity.

Why this exists
---------------
The Electron main executable shipped in the unsigned build has the same Mach-O
LC_UUID as every other app built from the same Electron binary. macOS local
network privacy keys state on that UUID, so the Dev copy was mis-attributed to
another app (observed: ZCode) and never received its own Local Network
permission.

This script copies the packaged app, rewrites the UUID of the main executable
and the four Electron helpers deterministically, sets the Dev bundle identity,
re-signs every Mach-O inside-out with a Developer ID identity (preserving each
file's existing entitlements), notarizes the result, staples the ticket, and
installs it atomically with a rollback copy.

Deterministic UUIDs (namespace + relative path + original UUID) mean a rebuild
of the same Electron version produces the same identity, so macOS privacy
grants survive reinstalling the Dev app.
"""
from __future__ import annotations

import argparse
import json
import os
import plistlib
import shutil
import struct
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime
from pathlib import Path

UUID_NAMESPACE = uuid.UUID("d682e48a-a791-4521-a9aa-283373e44537")
USAGE_DESCRIPTION = (
    "DeepSeek Harness 需要访问本地网络，以连接局域网内的开发服务器、SSH 主机和本地服务。"
)
DEFAULT_SOURCE = (
    "apps/desktop/.desktop-build/targets/mac-arm64/unsigned-artifacts/"
    "mac-arm64/DeepSeek Harness.app"
)
DEFAULT_DEST = "/Applications/Dev DeepSeek Harness.app"


def run(args: list[str], check: bool = True) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(args, check=check, capture_output=True)


def macho_slices(data: bytes) -> list[tuple[int, str, int]]:
    """Return (file offset, endianness, mach_header size) for each slice."""
    magic = data[:4]
    if magic in (b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe"):
        return [(0, "<", 32 if magic == b"\xcf\xfa\xed\xfe" else 28)]
    if magic in (b"\xca\xfe\xba\xbe", b"\xca\xfe\xba\xbf"):
        count = struct.unpack_from(">I", data, 4)[0]
        wide = magic[-1] == 0xBF
        out: list[tuple[int, str, int]] = []
        for index in range(count):
            position = 8 + index * (32 if wide else 20)
            offset = struct.unpack_from(">Q" if wide else ">I", data, position + 8)[0]
            if data[offset : offset + 4] != b"\xcf\xfa\xed\xfe":
                raise SystemExit(f"unsupported Mach-O slice at {offset}")
            out.append((offset, "<", 32))
        return out
    return []


def is_macho(path: Path) -> bool:
    try:
        with path.open("rb") as handle:
            return bool(macho_slices(handle.read(1 << 20)))
    except (OSError, struct.error, SystemExit):
        return False


def patch_uuid(executable: Path, app: Path) -> dict[str, str]:
    """Rewrite every LC_UUID deterministically, returning old/new values."""
    data = bytearray(executable.read_bytes())
    relative = str(executable.relative_to(app))
    changes: dict[str, str] = {}
    for offset, endian, header_size in macho_slices(data):
        count = struct.unpack_from(endian + "I", data, offset + 16)[0]
        cursor = offset + header_size
        seen = False
        for _ in range(count):
            command, size = struct.unpack_from(endian + "II", data, cursor)
            if size < 8:
                raise SystemExit(f"invalid load command in {executable}")
            if command == 0x1B:
                old = uuid.UUID(bytes=bytes(data[cursor + 8 : cursor + 24]))
                new = uuid.uuid5(UUID_NAMESPACE, f"{relative}:{old}")
                data[cursor + 8 : cursor + 24] = new.bytes
                changes[str(old)] = str(new)
                seen = True
            cursor += size
        if not seen:
            raise SystemExit(f"{executable} has no LC_UUID")
    executable.write_bytes(data)
    return changes


def entitlements(path: Path) -> bytes | None:
    result = run(["codesign", "-d", "--entitlements", ":-", str(path)], check=False)
    return result.stdout if result.stdout.strip() else None


def sign(path: Path, identity: str, ent: bytes | None, stage: Path, tag: str) -> None:
    args = [
        "codesign", "--force", "--sign", identity,
        "--options", "runtime", "--timestamp",
    ]
    if ent:
        ent_path = stage / f"entitlements-{tag}.plist"
        ent_path.write_bytes(ent)
        args += ["--entitlements", str(ent_path)]
    run(args + [str(path)])


def collect_bundles(app: Path) -> list[Path]:
    bundles = [app]
    for candidate in sorted(app.rglob("*.app")):
        if candidate == app:
            continue
        info_path = candidate / "Contents/Info.plist"
        if not info_path.is_file():
            continue
        info = plistlib.loads(info_path.read_bytes())
        if (candidate / "Contents/MacOS" / info.get("CFBundleExecutable", "")).is_file():
            bundles.append(candidate)
    return bundles


def bundle_metadata(bundle: Path) -> tuple[dict, Path] | None:
    if bundle.suffix == ".app":
        info_path = bundle / "Contents/Info.plist"
        if not info_path.is_file():
            return None
        info = plistlib.loads(info_path.read_bytes())
        executable = bundle / "Contents/MacOS" / info.get("CFBundleExecutable", "")
        return (info, executable) if executable.is_file() else None
    for info_path in (
        bundle / "Resources/Info.plist",
        bundle / "Versions/A/Resources/Info.plist",
        bundle / "Info.plist",
    ):
        if not info_path.is_file():
            continue
        info = plistlib.loads(info_path.read_bytes())
        name = info.get("CFBundleExecutable", "")
        for executable in (bundle / "Versions/A" / name, bundle / name):
            if executable.is_file():
                return info, executable
    return None


def sign_tree(app: Path, identity: str, stage: Path, saved: dict[Path, bytes | None]) -> list[Path]:
    machos = list(saved)
    for index, path in enumerate(machos):
        sign(path, identity, saved[path], stage, f"macho-{index}")

    containers: list[Path] = []
    for root, dirs, files in os.walk(app):
        current = Path(root)
        if current == app:
            continue
        if current.suffix == ".framework" or current.suffix == ".app":
            if bundle_metadata(current):
                containers.append(current)
    for index, container in enumerate(sorted(containers, key=lambda p: len(p.parts), reverse=True)):
        metadata = bundle_metadata(container)
        ent = saved.get(metadata[1]) if metadata else None
        sign(container, identity, ent, stage, f"container-{index}")

    main_executable = app / "Contents/MacOS" / plistlib.loads(
        (app / "Contents/Info.plist").read_bytes()
    )["CFBundleExecutable"]
    sign(app, identity, saved.get(main_executable), stage, "app")
    run(["codesign", "--verify", "--deep", "--strict", str(app)])
    return machos


def notarize(app: Path, profile: str, stage: Path) -> str:
    archive = stage / "Dev-uuid-fixed.zip"
    run(["ditto", "-c", "-k", "--keepParent", str(app), str(archive)])
    submit = run([
        "xcrun", "notarytool", "submit", str(archive),
        "--keychain-profile", profile, "--wait", "--output-format", "json",
    ])
    payload = json.loads(submit.stdout)
    if payload.get("status") != "Accepted":
        raise SystemExit(f"notarization was not accepted: {payload.get('status')}")
    run(["xcrun", "stapler", "staple", str(app)])
    run(["xcrun", "stapler", "validate", str(app)])
    run(["spctl", "--assess", "--type", "execute", "--verbose", "--", str(app)])
    return payload["id"]


def install(stage: Path, dest: Path, backup_dir: Path) -> Path | None:
    pending = dest.with_name(dest.name + ".pending")
    if pending.exists():
        shutil.rmtree(pending)
    run(["ditto", str(stage), str(pending)])
    run(["codesign", "--verify", "--deep", "--strict", str(pending)])
    backup: Path | None = None
    if dest.exists():
        backup = backup_dir / f"{dest.stem}-before-{datetime.now():%Y%m%d-%H%M%S}.app"
        run(["ditto", str(dest), str(backup)])
        shutil.rmtree(dest)
    try:
        pending.rename(dest)
    except BaseException:
        if backup is not None and not dest.exists():
            shutil.copytree(backup, dest)
        raise
    return backup


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("--source", default=DEFAULT_SOURCE)
    parser.add_argument("--dest", default=DEFAULT_DEST)
    parser.add_argument("--bundle-id", default="com.deepseek.harness.dsh")
    parser.add_argument("--display-name", default="Dev DeepSeek Harness")
    parser.add_argument("--identity", default=None)
    parser.add_argument("--profile", default="dsh")
    parser.add_argument("--notarize", dest="notarize", action="store_true", default=True)
    parser.add_argument("--no-notarize", dest="notarize", action="store_false")
    parser.add_argument("--stage-only", action="store_true")
    parser.add_argument("--backup-dir", default="/tmp")
    args = parser.parse_args()

    source = Path(args.source).expanduser().resolve()
    if not source.is_dir():
        raise SystemExit(f"missing build at {source}")
    identity = args.identity
    if identity is None:
        listing = subprocess.run(
            ["security", "find-identity", "-v", "-p", "codesigning"],
            capture_output=True, text=True,
        ).stdout
        identities = [line.split('"')[1] for line in listing.splitlines() if "Developer ID Application" in line]
        if not identities:
            raise SystemExit("no Developer ID Application identity in the keychain")
        identity = identities[0]

    stage = Path(tempfile.mkdtemp(prefix="dsh-dev-identity-"))
    app = stage / "Dev DeepSeek Harness.app"
    run(["ditto", str(source), str(app)])

    info_path = app / "Contents/Info.plist"
    info = plistlib.loads(info_path.read_bytes())
    info["CFBundleDisplayName"] = args.display_name
    info["CFBundleIdentifier"] = args.bundle_id
    info["NSLocalNetworkUsageDescription"] = USAGE_DESCRIPTION
    info_path.write_bytes(plistlib.dumps(info))
    for bundle in collect_bundles(app)[1:]:
        helper_info_path = bundle / "Contents/Info.plist"
        helper_info = plistlib.loads(helper_info_path.read_bytes())
        helper_info["NSLocalNetworkUsageDescription"] = USAGE_DESCRIPTION
        helper_info_path.write_bytes(plistlib.dumps(helper_info))

    uuid_changes: dict[str, dict[str, str]] = {}
    marker_path = app / "Contents/Resources/dsh-dev-identity.json"
    marker = json.loads(marker_path.read_text()) if marker_path.is_file() else None
    saved: dict[Path, bytes | None] = {}
    for root, dirs, files in os.walk(app):
        for name in files:
            path = Path(root) / name
            if path.is_symlink() or not is_macho(path):
                continue
            saved[path] = entitlements(path)
    if marker is None:
        for bundle in collect_bundles(app):
            info = plistlib.loads((bundle / "Contents/Info.plist").read_bytes())
            executable = bundle / "Contents/MacOS" / info["CFBundleExecutable"]
            uuid_changes[str(bundle.relative_to(app))] = patch_uuid(executable, app)
        marker_path.write_text(json.dumps({
            "namespace": str(UUID_NAMESPACE),
            "bundles": uuid_changes,
        }, indent=2))

    signed = sign_tree(app, identity, stage, saved)
    notarization = notarize(app, args.profile, stage) if args.notarize else None
    backup = None if args.stage_only else install(app, Path(args.dest), Path(args.backup_dir))
    if not args.stage_only:
        run([
            "/System/Library/Frameworks/CoreServices.framework/Frameworks/"
            "LaunchServices.framework/Support/lsregister",
            "-f", args.dest,
        ], check=False)

    print(json.dumps({
        "app": args.dest if not args.stage_only else str(app),
        "identity": identity,
        "bundle_id": args.bundle_id,
        "signed_macho": len(signed),
        "uuid_changes": uuid_changes,
        "notarization": notarization,
        "backup": str(backup) if backup else None,
        "stage": None if not args.stage_only else str(stage),
    }, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
