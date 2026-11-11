# Isolated prototype; do not expose directly to public traffic without authentication.
# No inference provider APIs: llama.cpp executes the downloaded open weights on the host CPU.
FROM ghcr.io/ggml-org/llama.cpp:server
EXPOSE 7860
ENTRYPOINT ["/app/llama-server"]
CMD ["--hf-repo","unsloth/Qwen3.5-2B-GGUF:Q4_K_M","--no-mmproj","--host","0.0.0.0","--port","7860","--ctx-size","4096","--threads","2","--parallel","1","--n-gpu-layers","0","--predict","256"]
