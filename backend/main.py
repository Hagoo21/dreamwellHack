from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import public

app = FastAPI()

# Include routes
app.include_router(public.router, prefix="/public", tags=["Public"])

# Add CORS middleware with expanded configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "chrome-extension://*"],  # Allow React app and Chrome extension
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Welcome to the FastAPI Backend"}