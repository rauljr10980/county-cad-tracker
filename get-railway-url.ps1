# Get and Verify Railway Backend URL
# This script helps you find and verify your Railway deployment URL

Write-Host "🚀 Railway URL Finder & Verifier" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Common Railway URL patterns to test
$urls = @(
    "https://county-cad-tracker-production.up.railway.app",
    "https://county-cad-tracker.up.railway.app",
    "https://county-cad-tracker-production-railway.up.railway.app",
    "https://county-cad-tracker-$(Get-Random -Minimum 1000 -Maximum 9999).up.railway.app"
)

Write-Host "📋 Testing common Railway URL patterns..." -ForegroundColor Yellow
Write-Host ""

$foundUrl = $null
$workingUrls = @()

foreach ($url in $urls) {
    Write-Host "Testing: $url" -ForegroundColor Gray
    try {
        # Test health endpoint
        $healthResponse = Invoke-WebRequest -Uri "$url/health" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        if ($healthResponse.StatusCode -eq 200) {
            $responseData = $healthResponse.Content | ConvertFrom-Json
            Write-Host "✅ SUCCESS! URL is accessible: $url" -ForegroundColor Green
            Write-Host "   Health Status: $($responseData.status)" -ForegroundColor Green
            Write-Host "   Timestamp: $($responseData.timestamp)" -ForegroundColor Green
            Write-Host ""
            
            if (-not $foundUrl) {
                $foundUrl = $url
            }
            $workingUrls += $url
        }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 404) {
            Write-Host "   ⚠️  URL exists but /health endpoint not found (404)" -ForegroundColor Yellow
            Write-Host "   Testing root endpoint..." -ForegroundColor Yellow
            try {
                $rootResponse = Invoke-WebRequest -Uri "$url/" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
                Write-Host "   ✅ Root endpoint works! URL: $url" -ForegroundColor Green
                if (-not $foundUrl) {
                    $foundUrl = $url
                }
                $workingUrls += $url
            } catch {
                Write-Host "   ❌ Root endpoint also failed" -ForegroundColor Red
            }
        } elseif ($statusCode) {
            Write-Host "   ❌ HTTP $statusCode - Not accessible" -ForegroundColor Red
        } else {
            Write-Host "   ❌ Connection failed: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    Write-Host ""
}

Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

if ($foundUrl) {
    Write-Host "🎉 FOUND WORKING URL!" -ForegroundColor Green
    Write-Host "   Your Railway backend URL is: $foundUrl" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 Next Steps:" -ForegroundColor Yellow
    Write-Host "   1. Copy this URL: $foundUrl" -ForegroundColor White
    Write-Host "   2. Update your frontend .env or GitHub Actions workflow" -ForegroundColor White
    Write-Host "   3. Set VITE_API_URL=$foundUrl" -ForegroundColor White
    Write-Host ""
    
    # Test additional endpoints
    Write-Host "🔍 Testing additional endpoints..." -ForegroundColor Cyan
    $endpoints = @("/api/health", "/", "/api")
    foreach ($endpoint in $endpoints) {
        try {
            $testResponse = Invoke-WebRequest -Uri "$foundUrl$endpoint" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
            Write-Host "   ✅ $endpoint - Status: $($testResponse.StatusCode)" -ForegroundColor Green
        } catch {
            Write-Host "   ❌ $endpoint - Not accessible" -ForegroundColor Red
        }
    }
} else {
    Write-Host "❌ Could not find working Railway URL automatically" -ForegroundColor Red
    Write-Host ""
    Write-Host "📋 Manual Steps to Find Your Railway URL:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   1. Go to Railway Dashboard: https://railway.app/" -ForegroundColor White
    Write-Host "   2. Click on your 'county-cad-tracker' service" -ForegroundColor White
    Write-Host "   3. Go to the 'Settings' tab" -ForegroundColor White
    Write-Host "   4. Scroll to 'Networking' section" -ForegroundColor White
    Write-Host "   5. Look for 'Public Domain' or click 'Generate Domain'" -ForegroundColor White
    Write-Host "   6. Copy the URL (format: https://service-name-XXXX.up.railway.app)" -ForegroundColor White
    Write-Host ""
    Write-Host "   Then test it with:" -ForegroundColor Yellow
    Write-Host "   curl https://YOUR-URL/health" -ForegroundColor White
    Write-Host ""
    Write-Host "   Or run this script again with the URL:" -ForegroundColor Yellow
    Write-Host "   .\get-railway-url.ps1 -Url https://your-url.up.railway.app" -ForegroundColor White
}

Write-Host ""
Write-Host "=================================" -ForegroundColor Cyan


