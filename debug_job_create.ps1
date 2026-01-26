$ErrorActionPreference = "Stop"

$SUPABASE_URL = "https://sbnthkwhygrrjjdyylgd.supabase.co"
$ANON_KEY = "sb_publishable_ainw6qIH2SUlwQ3SAzRLZQ_oIZKyygr"
$HEADERS = @{
    "apikey"       = $ANON_KEY
    "Content-Type" = "application/json"
}

$Email = "test@tradiehub.com"
$Pass = "testpassword123"
Write-Host "Auth..."
$Auth = Invoke-RestMethod -Uri "$SUPABASE_URL/auth/v1/token?grant_type=password" -Method Post -Headers $HEADERS -Body (@{ email = $Email; password = $Pass } | ConvertTo-Json)
$Token = $Auth.access_token
$UserID = $Auth.user.id
Write-Host "UserID: $UserID"

$H = $HEADERS.Clone()
$H["Authorization"] = "Bearer $Token"

Write-Host "Creating Minimal Job..."
$JobBody = @{
    customer_id = $UserID
    title       = "DEBUG_JOB_" + (Get-Random)
    description = "Debug"
    location    = "Sydney"
    state       = "NSW"
    status      = "open"
    categories  = @("plumbing") # Trying with array
} | ConvertTo-Json

$JH = $H.Clone()
$JH["Prefer"] = "return=representation"

try {
    Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/jobs" -Method Post -Headers $JH -Body $JobBody
    Write-Host "Success!"
}
catch {
    Write-Host "Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $Stream = $_.Exception.Response.GetResponseStream()
        $Reader = New-Object System.IO.StreamReader($Stream)
        $Body = $Reader.ReadToEnd()
        Write-Host "Response Body: $Body"
    }
}
