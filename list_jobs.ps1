$ErrorActionPreference = "Stop"

$SUPABASE_URL = "https://sbnthkwhygrrjjdyylgd.supabase.co"
$ANON_KEY = "sb_publishable_ainw6qIH2SUlwQ3SAzRLZQ_oIZKyygr"
$HEADERS = @{
    "apikey"       = $ANON_KEY
    "Content-Type" = "application/json"
}

$Email = "test@tradiehub.com"
$Pass = "testpassword123"
Write-Host "Logging in..."
$Auth = Invoke-RestMethod -Uri "$SUPABASE_URL/auth/v1/token?grant_type=password" -Method Post -Headers $HEADERS -Body (@{ email = $Email; password = $Pass } | ConvertTo-Json)
$Token = $Auth.access_token
$UserID = $Auth.user.id
Write-Host "User ID: $UserID"

$H = $HEADERS.Clone()
$H["Authorization"] = "Bearer $Token"

Write-Host "Listing jobs..."
$Jobs = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/jobs?customer_id=eq.$UserID" -Method Get -Headers $H

Write-Host "Found $($Jobs.Count) Jobs."
if ($Jobs.Count -gt 0) {
    if ($Jobs -isnot [array]) { $Jobs = @($Jobs) }
    foreach ($J in $Jobs) {
        Write-Host "ID: $($J.id) | Title: $($J.title)"
    }
}
