# NVIDIA NIM Setup Guide

This guide explains how to set up and run the NVIDIA NIM (NVIDIA Inference Microservice) for the Parakeet ASR (Automatic Speech Recognition) model used in J.A.R.V.I.S.

## Step 1: Generate API Key

### Get API Key

1. Visit the [NVIDIA NGC Portal](https://ngc.nvidia.com/)
2. Sign in or create an account
3. Generate an API key from your account settings
4. Copy the API key for the next step

## Step 2: Pull and Run the NIM

### Docker Authentication

First, authenticate with the NVIDIA container registry:

```bash
docker login nvcr.io
Username: $oauthtoken
Password: <PASTE_API_KEY_HERE>
```

### Set Environment Variable

Export your API key as an environment variable:

```bash
export NGC_API_KEY=<PASTE_API_KEY_HERE>
```

### Run the NIM Container

Pull and run the Parakeet 1.1B CTC ASR model:

```bash
docker run -it --rm --name=parakeet-1-1b-ctc-en-us \
   --runtime=nvidia \
   --gpus '"device=0"' \
   --shm-size=8GB \
   -e NGC_API_KEY \
   -e NIM_HTTP_API_PORT=9000 \
   -e NIM_GRPC_API_PORT=50051 \
   -p 9000:9000 \
   -p 50051:50051 \
   -e NIM_TAGS_SELECTOR=mode=str \
   nvcr.io/nim/nvidia/parakeet-1-1b-ctc-en-us:latest
```

### Configuration Details

- **`--runtime=nvidia`**: Uses NVIDIA's container runtime for GPU access
- **`--gpus '"device=0"'`**: Allocates GPU device 0 (modify if using a different GPU)
- **`--shm-size=8GB`**: Allocates shared memory for inference
- **`NGC_API_KEY`**: Your NVIDIA NGC API key (passed from environment)
- **`NIM_HTTP_API_PORT=9000`**: HTTP API port
- **`NIM_GRPC_API_PORT=50051`**: gRPC API port
- **`NIM_TAGS_SELECTOR=mode=str`**: Selector tag for the model mode

### Verify the Container is Running

Once started, you should see output indicating the NIM is ready. The HTTP API will be available at `http://localhost:9000` and the gRPC API at `localhost:50051`.

## Integration with J.A.R.V.I.S.

After setting up the NIM container:

1. Create a `.env.local` file in the project root (copy from `.env.example` if available)
2. Set the `NVIDIA_API_KEY` environment variable with your NGC API key
3. Optionally override endpoint URLs if running your own NIM docker node:
   ```
   NVIDIA_API_KEY=<your_api_key>
   NIM_ASR_ENDPOINT=http://localhost:9000  # Optional override
   ```

4. Run the J.A.R.V.I.S. application:
   ```bash
   npm install
   npm run dev
   ```

The application will automatically connect to the running NIM container for voice transcription.

## Supported Models

Refer to [NVIDIA NIM Supported Models](https://docs.nvidia.com/nim/riva/asr/latest/getting-started.html#supported-models) for the full list of available ASR models and their specifications.

## Troubleshooting

- **Docker authentication failed**: Ensure your API key is correct and you've authenticated with `docker login nvcr.io`
- **GPU not found**: Verify NVIDIA drivers are installed and the GPU is accessible with `nvidia-smi`
- **Port already in use**: Change the port mappings if 9000 or 50051 are already in use
- **Container exits immediately**: Check Docker logs with `docker logs parakeet-1-1b-ctc-en-us`

## Local Fallback

If NIM credentials are not available, J.A.R.V.I.S. will run in **local fallback mode**, displaying the status `NIM CREDENTIALS ABSENT · LOCAL FALLBACK ACTIVE` on the HUD. This allows testing the interface without GPU or API credentials.
