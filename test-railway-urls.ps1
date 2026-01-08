# Test common Railway URL patterns to find the correct backend URL

Write-Host "Testing common Railway URL patterns..." -ForegroundColor Cyan
Write-Host ""

$urls = @(
    "https://county-cad-tracker-production.up.railway.app",
    "https://county-cad-tracker.up.railway.app",
    "https://county-cad-tracker-production-railway.up.railway.app"
)

foreach ($url in $urls) {
    Write-Host "Testing: $url" -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "$url/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Write-Host "✅ FOUND IT! This URL works: $url" -ForegroundColor Green
        Write-Host "Response: $($response.Content)" -ForegroundColor Green
        Write-Host ""
        Write-Host "This is your Railway backend URL!" -ForegroundColor Green
        break
    } catch {
        Write-Host "❌ Not accessible: $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host ""
Write-Host "If none of these worked:" -ForegroundColor Yellow
Write-Host "1. Go to Railway Dashboard → county-cad-tracker service → Settings" -ForegroundColor White
Write-Host "2. Look for 'Public Domain' or 'Generate Domain'" -ForegroundColor White
Write-Host "3. Copy that URL and test it with: curl https://YOUR-URL/health" -ForegroundColor White


