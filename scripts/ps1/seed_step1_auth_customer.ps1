$ErrorActionPreference = "Stop"

$SUPABASE_URL = "https://sbnthkwhygrrjjdyylgd.supabase.co"
$ANON_KEY = "sb_publishable_ainw6qIH2SUlwQ3SAzRLZQ_oIZKyygr"
$HEADERS = @{
    "apikey" = $ANON_KEY
    "Content-Type" = "application/json"
}

# 1. Authenticate Customer
Write-Host "Authenticating Customer..."
$CustomerEmail = "test@tradiehub.com"
$CustomerPassword = "testpassword123"

$AuthBody = @{
    email = $CustomerEmail
    password = $CustomerPassword
} | ConvertTo-Json

try {
    $CustomerAuth = Invoke-RestMethod -Uri "$SUPABASE_URL/auth/v1/token?grant_type=password" -Method Post -Headers $HEADERS -Body $AuthBody
    $CustomerJWT = $CustomerAuth.access_token
    $CustomerID = $CustomerAuth.user.id
    Write-Host "Customer Authenticated. ID: $CustomerID"
} catch {
    Write-Host "Failed to authenticate customer."
    Write-Host $_.Exception.Message
    exit 1
}

# Save context for next steps
$Context = @{
    CustomerID = $CustomerID
    CustomerJWT = $CustomerJWT
} | ConvertTo-Json

$Context | Out-File "seed_context.json"
