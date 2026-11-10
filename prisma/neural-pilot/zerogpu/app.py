"""Prisma Neural experiment: free ZeroGPU only; no Prisma production connections."""
import gc
import gradio as gr
import spaces

MODEL = "Qwen/Qwen3.5-2B"
SYSTEM = (
    "Eres el prototipo neuronal experimental de Prisma. Responde en español, "
    "admite incertidumbre, no inventes datos ni afirmes ejecutar herramientas. "
    "Nunca respondas que has cambiado archivos, enviado correos o usado APIs."
)


@spaces.GPU(duration=90)
def inference(prompt, history):
    """GPU activity stays within decorated function (ZeroGPU requirement)."""
    import torch
    from transformers import AutoProcessor, Qwen3_5ForConditionalGeneration

    prompt = str(prompt or "").strip()[:2400]
    if not prompt:
        return "Escribe una pregunta."
    messages = [{"role": "system", "content": SYSTEM}]
    for turn in (history or [])[-6:]:
        role = turn.get("role") if isinstance(turn, dict) else None
        text = turn.get("content") if isinstance(turn, dict) else None
        if role in ("user", "assistant") and isinstance(text, str) and text.strip():
            messages.append({"role": role, "content": text[:1200]})
    messages.append({"role": "user", "content": prompt})
    model = None
    try:
        processor = AutoProcessor.from_pretrained(MODEL)
        model = Qwen3_5ForConditionalGeneration.from_pretrained(
            MODEL, dtype=torch.bfloat16, device_map="cuda", low_cpu_mem_usage=True
        )
        inputs = processor.apply_chat_template(
            messages, tokenize=True, add_generation_prompt=True,
            return_dict=True, return_tensors="pt"
        )
        inputs = {k: v.to("cuda") if hasattr(v, "to") else v for k, v in inputs.items()}
        with torch.inference_mode():
            generated = model.generate(
                **inputs, max_new_tokens=160, do_sample=False
            )
        new_ids = generated[:, inputs["input_ids"].shape[-1]:]
        return processor.batch_decode(
            new_ids, skip_special_tokens=True,
            clean_up_tokenization_spaces=False
        )[0].strip() or "No se obtuvo una respuesta útil."
    except Exception as exc:
        # Public demo never dumps exception details that might contain user content.
        print("Prisma Neural ZeroGPU inference error:", type(exc).__name__)
        return "El servidor experimental no pudo procesar esta solicitud. La cuota, el tiempo o la memoria pueden haberse agotado."
    finally:
        del model
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


with gr.Blocks(title="Prisma Neural · ZeroGPU (experimental)") as demo:
    gr.Markdown(
        "# Prisma Neural · Modelo Qwen3.5-2B\n"
        "Prueba independiente en GPU compartida, sin descargar el modelo en tu teléfono. "
        "No adjuntes información privada. No está conectado a las herramientas de Prisma Core."
    )
    gr.ChatInterface(
        fn=inference, type="messages",
        examples=[
            "Explica qué es una API con un ejemplo.",
            "¿En qué se diferencian autenticación y autorización?",
            "Quiero analizar una imagen. ¿Puedes hacerlo sin verla?"
        ]
    )

if __name__ == "__main__":
    demo.queue(default_concurrency_limit=1).launch()
