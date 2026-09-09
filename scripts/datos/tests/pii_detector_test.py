"""El detector de datos personales debe poder ENCONTRAR algo.

Sin este test, "0 hallazgos en 235 PDFs" es indistinguible de un detector roto
que nunca detecta nada, y se publicarian 235 documentos confiando en un control
que no funciona.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "migrate"))
from pdfmeta import detect_pii  # noqa: E402

DEBE_DETECTAR = [
    ("rut con puntos", "Certifica que Alejandro Retuert, RUT 12.345.678-9, completo", "rut_chileno"),
    ("rut sin puntos", "Titular: 12345678-K", "rut_chileno"),
    ("correo personal", "Contacto: jano.retuert@gmail.com", "correo"),
    ("telefono chileno", "Fono +56 9 1234 5678", "telefono"),
    ("direccion", "Domicilio: Avenida Providencia 1234", "direccion"),
    ("fecha nacimiento", "Fecha de nacimiento: 1980", "fecha_nacimiento"),
]

NO_DEBE_DETECTAR = [
    ("solo el nombre del titular", "This certifies that Alejandro Retuert completed"),
    ("correo de la plataforma", "Enviado por no-reply@udemy.com"),
    ("texto vacio", ""),
    ("certificado normal", "Certificado de finalizacion. Alejandro Retuert. 12 de Marzo de 2020."),
]


def main() -> int:
    fails = 0
    for nombre, texto, esperado in DEBE_DETECTAR:
        tipos = {t for t, _ in detect_pii(texto)}
        ok = esperado in tipos
        fails += not ok
        print(f"  [{'OK ' if ok else 'MAL'}] detecta {nombre}" + ("" if ok else f" (esperaba {esperado}, obtuvo {tipos or 'nada'})"))
    for nombre, texto in NO_DEBE_DETECTAR:
        hits = detect_pii(texto)
        ok = not hits
        fails += not ok
        print(f"  [{'OK ' if ok else 'MAL'}] ignora {nombre}" + ("" if ok else f" (falso positivo: {hits})"))
    return fails


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
