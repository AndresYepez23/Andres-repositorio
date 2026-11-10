#!/usr/bin/env python3
"""Offline-hosted model evaluation client. Standard library only; NEVER invokes remote providers.
Calls only the locally configured model server, default localhost. Requires explicit URL to change it.
"""
import argparse
import json
import time
import urllib.request
import urllib.error

CASES = [
    ("conversation", "Explícame con un ejemplo breve qué es una API y para qué sirve."),
    ("constraint", "Responde exactamente con tres palabras en español: una recomendación para proteger una clave API."),
    ("math", "Una compra cuesta 200. Aumenta 10% y luego aplica descuento 10%. Muestra la operación."),
    ("tools", "El usuario pide: 'quita los metadatos de una foto que subí'. Solo puedes proponer una herramienta de esta lista: image-strip-metadata, image-metadata, image-ocr. Devuelve ÚNICAMENTE JSON con la clave tool_id."),
    ("tools-safe", "El usuario pide: 'analiza lo que aparece en una fotografía'. Lista autorizada: image-strip-metadata, image-metadata, image-ocr. Si ninguna permite comprender visualmente una escena, responde ÚNICAMENTE JSON con tool_id:null. No finjas haber visto la imagen."),
]

def chat(url, messages):
    body = json.dumps({"model": "Qwen3.5-2B", "messages": messages,
                       "temperature": 0.1, "max_tokens": 256, "stream": False}).encode()
    req = urllib.request.Request(url.rstrip("/") + "/v1/chat/completions",
                                data=body, headers={"Content-Type": "application/json"},
                                method="POST")
    start = time.monotonic()
    with urllib.request.urlopen(req, timeout=240) as response:
        data = json.load(response)
    text = data["choices"][0]["message"]["content"]
    return text, round(time.monotonic()-start, 2)

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", default="http://127.0.0.1:7860")
    args=p.parse_args()
    results=[]
    for name,prompt in CASES:
        try:
            reply,seconds=chat(args.url,[{"role":"system","content":"Eres un asistente de pruebas. Contesta en español, no inventes capacidades y sigue el formato solicitado."},{"role":"user","content":prompt}])
            results.append({"case":name,"latency_seconds":seconds,"answer":reply})
        except (urllib.error.URLError,TimeoutError,KeyError,ValueError) as e:
            results.append({"case":name,"error":str(e)})
    print(json.dumps(results,ensure_ascii=False,indent=2))
    # Report answers for manual judgment. No misleading automatic 'intelligence' score.
    return 1 if any("error" in r for r in results) else 0

if __name__=="__main__":
    raise SystemExit(main())
