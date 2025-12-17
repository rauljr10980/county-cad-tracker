# Setup script for local testing
Write-Host "Setting up local environment..." -ForegroundColor Green

# Create .env file if it doesn't exist
if (-not (Test-Path ".env")) {
    @"
# Local development API URL
VITE_API_URL=http://localhost:8080

# Google Cloud Configuration (for local testing)
# Uncomment and set if you have a service account key file
# GOOGLE_APPLICATION_CREDENTIALS=./functions/service-account-key.json
# GCP_PROJECT_ID=tax-delinquent-software
# GCS_BUCKET=county-cad-tracker-files
"@ | Out-File -FilePath ".env" -Encoding utf8
    Write-Host "Created .env file" -ForegroundColor Green
} else {
    Write-Host ".env file already exists" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Authenticate with Google Cloud:" -ForegroundColor White
Write-Host "   gcloud auth application-default login" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Start backend (Terminal 1):" -ForegroundColor White
Write-Host "   cd functions" -ForegroundColor Gray
Write-Host "   npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Start frontend (Terminal 2):" -ForegroundColor White
Write-Host "   npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Open browser: http://localhost:5173" -ForegroundColor White

