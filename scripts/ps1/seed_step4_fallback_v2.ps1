$ErrorActionPreference = "Stop"

$SUPABASE_URL = "https://sbnthkwhygrrjjdyylgd.supabase.co"
$ANON_KEY = "sb_publishable_ainw6qIH2SUlwQ3SAzRLZQ_oIZKyygr"
$HEADERS = @{
    "apikey"       = $ANON_KEY
    "Content-Type" = "application/json"
}

# 1. Login as Test User
$Email = "test@tradiehub.com"
$Pass = "testpassword123"
Write-Host "Logging in as $Email..."

try {
    $Body = @{ email = $Email; password = $Pass } | ConvertTo-Json
    $Auth = Invoke-RestMethod -Uri "$SUPABASE_URL/auth/v1/token?grant_type=password" -Method Post -Headers $HEADERS -Body $Body
    $Token = $Auth.access_token
    $UserID = $Auth.user.id
}
catch {
    Write-Host "Auth failed: $($_.Exception.Message)"
    exit 1
}

$H = $HEADERS.Clone()
$H["Authorization"] = "Bearer $Token"

# 2. Update Role to Dual
Write-Host "Updating role to 'dual'..."
try {
    $UserBody = @{ role = "dual" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/users?id=eq.$UserID" -Method Patch -Headers $H -Body $UserBody
    Write-Host "Role updated."
}
catch {
    Write-Host "Role update failed (might be RLS?), proceeding... $($_.Exception.Message)"
}

# 3. Create NEW Job
Write-Host "Creating NEW Verify Job..."
$JobBody = @{
    customer_id = $UserID
    title       = "GA CODEX VERIFICATION JOB"
    description = "Fixture for verifying accepted job flow"
    location    = "Test City"
    state       = "NSW"
    status      = "open"
    categories  = @("plumbing")
} | ConvertTo-Json

# Merge headers for Prefer
$JobHeaders = $H.Clone()
$JobHeaders["Prefer"] = "return=representation"

try {
    $JobRes = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/jobs" -Method Post -Headers $JobHeaders -Body $JobBody
    if ($JobRes -is [array]) { $Job = $JobRes[0] } else { $Job = $JobRes }
    $JobID = $Job.id
    Write-Host "Created Job: $JobID"
}
catch {
    Write-Host "Job creation failed: $($_.Exception.Message)"
    exit 1
}

# 4. Create Assignment (Self)
Write-Host "Creating Self-Assignment..."
$AssignBody = @{
    job_id      = $JobID
    customer_id = $UserID
    tradie_id   = $UserID
    status      = "active"
    accepted_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json

try {
    $Check = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/job_assignments?job_id=eq.$JobID" -Method Get -Headers $H
    if ($Check.Count -eq 0) {
        Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/job_assignments" -Method Post -Headers $H -Body $AssignBody
        Write-Host "Assignment Created."
    }
    else {
        Write-Host "Assignment already exists."
    }
}
catch {
    Write-Host "Assignment failed: $($_.Exception.Message)"
}

# 5. Output
$Output = @{
    TEST_CUSTOMER_EMAIL    = $Email
    TEST_CUSTOMER_PASSWORD = $Pass
    TEST_TRADIE_EMAIL      = $Email
    TEST_TRADIE_PASSWORD   = $Pass
    TEST_JOB_ID            = $JobID
    TEST_CONVERSATION_ID   = "NOT FOUND (Self-Conversation Blocked)"
}

$Output | ConvertTo-Json | Out-File "final_env.json"
