"""Tabla manual de los certificados de Udemy.

Los 17 PDFs de `Certs Udemy` son IMAGENES sin capa de texto: `pdftotext`
devuelve vacio y en la maquina no hay tesseract. Se resolvieron leyendolos
visualmente uno por uno el 2026-09-07.

Esto NO es reproducible por script. Queda versionado y fechado justamente por
eso: es el unico tramo del cruce que depende de trabajo humano, y quien lo
revise en dos anos necesita saberlo.

El nombre del archivo ES el id de credencial de Udemy, asi que `verify_url` se
deriva de el y no hace falta anotarla aqui.
"""

# clave: prefijo del nombre de archivo  ->  (titulo del Sheet, fecha ISO, horas)
UDEMY = {
    "UC-04UX8HLX": ("Monta un Cluster Hadoop Big Data desde cero", "2020-01-27", None),
    "UC-1GTQMHGE": ("The Ultimate Hands-On Hadoop - Tame your Big Data!", "2020-01-23", None),
    "UC-1e97b210": ("Machine Learning Masterclass A-Z: Beginner to Advance", "2020-03-11", 3.0),
    "UC-4a77756e": ("OKR Goal Setting 101 - Achieve more goals than ever! Faster!", "2020-03-17", 1.5),
    "UC-56efded2": ("Ethical Hacking Crash Course 2020", None, None),
    "UC-5b268258": ("RHCE Linux System Engineer Complete Course", "2020-03-06", 5.0),
    "UC-6064ad42": ("Hands-on Unix or Linux Commands with grep, awk, sed & more!", "2020-03-15", 2.5),
    "UC-726a34d3": ("Terraform Beginner to Advanced - Using Google Cloud Platform", "2021-01-15", 2.5),
    "UC-8b705723": ("Google Cloud Platform - Práctico", None, None),
    "UC-8ca1a2e8": ("Basics of Deep Learning", "2020-03-06", 2.0),
    "UC-8ea57561": ("Apache Kafka and Spring Boot (Consumer, Producer)", "2020-03-16", 1.0),
    "UC-93cd0c70": ("Google Kubernetes Engine - de cero a experto", None, None),
    "UC-94ce4146": ("GitLab CI: Pipelines, CI/CD and DevOps for Beginners", "2021-02-22", 5.0),
    "UC-9e03e3d8": ("GCP: Complete Google Data Engineer and Cloud Architect Guide", "2021-04-12", 28.0),
    "UC-c3b64608": ("Superminds: Artificial Intelligence in 2019-2025 Markets", "2020-03-13", 0.65),
    "UC-d7060d73": ("Splunk 2020 - Beginner to Architect", "2020-02-21", None),
}

# Duplicados conocidos: misma credencial en otro idioma. No son certificados
# distintos y no deben contarse dos veces.
DUPLICADOS = {
    "UC-5b268258-3de7-4b71-9b79-2c66270d17ad (en)": "UC-5b268258",
}

# Internacionales: el nombre de archivo no se parece al titulo, pero es
# inequivoco. Verificado abriendo cada PDF.
INTERNACIONALES = {
    "ScrumAlliance_CSM_Certificate": "Scrum Master",
    "2000841198-LEANITAF": "Lean IT",
    "2000843000-EBDP": "Enterprise Big Data Professional",
    "DevOps-8eb79cedeedf": "DevOps Fundamentals",
    "CloudDigitalLeader20250902-32-k7bpg0": "Cloud Digital Leader",
}
