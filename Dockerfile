# 1. Base Image
FROM python:3.9-slim

# 2. Set Root Working Directory
# We start at the root so we can copy BOTH backend and frontend folders
WORKDIR /app

# 3. Install System Dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 4. Copy Requirements specific to backend
# We copy this first to leverage Docker caching (speeds up re-builds)
COPY backend/requirements.txt backend/requirements.txt

# 5. Install Python Dependencies
# We point to the file inside the backend folder
RUN pip install --no-cache-dir -r backend/requirements.txt

# 6. Copy the ENTIRE project (Backend + Frontend)
# This results in /app/backend and /app/frontend existing inside the container
COPY . .

# 7. Change Directory to Backend
# This is CRITICAL. It makes the app think it is running inside the 'backend' folder,
# fixing the "ModuleNotFoundError: config" and the "frontend path" issues.
WORKDIR /app/backend

# 8. Expose Port
EXPOSE 5000

# 9. Run Command
# Added --timeout 120 to prevent S3 uploads from timing out
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--timeout", "120", "app:app"]