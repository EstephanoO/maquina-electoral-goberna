#!/usr/bin/env python3

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[2]


def fail(message: str) -> None:
    print(f"[architecture-check] {message}")
    raise SystemExit(1)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def check_backend_hexagonal_guardrails() -> None:
    forbidden = ["../../app", "../../server", "../app", "../server"]
    module_files = list((ROOT / "apps/backend/src/modules").rglob("*.ts"))
    bad: list[str] = []
    for file_path in module_files:
        text = read(file_path)
        for entry in forbidden:
            if entry in text:
                bad.append(f"{file_path.relative_to(ROOT)} -> {entry}")
    if bad:
        fail("backend module acoplando app/server: " + ", ".join(bad))


def check_frontend_screaming_guardrails() -> None:
    frontend_files = list((ROOT / "nexus-web/app").rglob("*.tsx")) + list((ROOT / "nexus-web/app").rglob("*.ts"))
    bad: list[str] = []
    for file_path in frontend_files:
        text = read(file_path)
        if "apps/backend" in text or "from \"../../apps/backend" in text:
            bad.append(str(file_path.relative_to(ROOT)))
    if bad:
        fail("frontend app importando backend internals: " + ", ".join(bad))


def check_tracking_contract_file() -> None:
    contract = ROOT / "NUEVO_CONTRATO_EXPO.md"
    if not contract.exists():
        fail("falta NUEVO_CONTRATO_EXPO.md")
    text = read(contract)
    if "location.batch" not in text:
        fail("NUEVO_CONTRATO_EXPO.md debe declarar location.batch")
    if re.search(r"`location\.update`.*activo", text, flags=re.IGNORECASE):
        fail("NUEVO_CONTRATO_EXPO.md no puede marcar location.update como activo")


def main() -> int:
    check_backend_hexagonal_guardrails()
    check_frontend_screaming_guardrails()
    check_tracking_contract_file()
    print("[architecture-check] ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
