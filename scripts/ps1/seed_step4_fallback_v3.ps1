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

# 3. Create or Find Job
Write-Host "Checking for existing verification job..."
$JobTitle = "GA CODEX VERIFICATION JOB"
# Encode spaces
$EncodedTitle = $JobTitle.Replace(" ", "%20")
try {
    $ExistingJobs = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/jobs?title=eq.$EncodedTitle" -Method Get -Headers $H
    if ($ExistingJobs.Count -gt 0) {
        $Job = $ExistingJobs[0]
        $JobID = $Job.id
        Write-Host "Found Existing Job: $JobID"
    }
    else {
        Write-Host "Creating NEW Verify Job..."
        $JobBody = @{
            customer_id = $UserID
            title       = $JobTitle
            description = "Fixture for verifying accepted job flow"
            location    = "Test City"
            state       = "NSW"
            status      = "open"
            categories  = @("plumbing")
        } | ConvertTo-Json

        $JobHeaders = $H.Clone()
        $JobHeaders["Prefer"] = "return=representation"
        
        $JobRes = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/jobs" -Method Post -Headers $JobHeaders -Body $JobBody
        if ($JobRes -is [array]) { $Job = $JobRes[0] } else { $Job = $JobRes }
        $JobID = $Job.id
        Write-Host "Created Job: $JobID"
    }
}
catch {
    if ($_.Exception.Message -match "Conflict") {
        Write-Host "Job already exists (Conflict caught), attempting to retrieve..."
        # We need to get the job if it failed creation due to conflict (though title check should have caught it, maybe race/deleted?)
        # For simplicity in this script, we'll try fetch again or just fail safely if we can't get ID.
        try {
            $ExistingJobs = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/jobs?title=eq.$EncodedTitle" -Method Get -Headers $H
            Write-Host "Found $($ExistingJobs.Count) matches."
            if ($ExistingJobs.Count -gt 0) {
                # Handle potential PSObject wrapping
                if ($ExistingJobs -is [array]) { $Job = $ExistingJobs[0] } else { $Job = $ExistingJobs }
                $JobID = $Job.id
                Write-Host "Retrieved Existing Job: $JobID"
            }
            else {
                # Try getting it by ID if we happen to know it locally
                $UserJobs = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/jobs?customer_id=eq.$UserID&title=eq.$EncodedTitle" -Method Get -Headers $H
                if ($UserJobs.Count -gt 0) {
                    $JobID = $UserJobs[0].id
                    Write-Host "Retrieved Job via User lookup: $JobID"
                }
            }
        }
        catch { Write-Host "Could not retrieve job after conflict." }
    }
    else {
        Write-Host "Job check/create failed: $($_.Exception.Message)"
    }
    # Fallback to hardcoded ID if we can't create (unlikely to work if not found, but safe)
    if (-not $JobID) { exit 1 }
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
    if ($_.Exception.Message -match "Conflict") {
        Write-Host "Assignment already exists (Conflict caught), proceeding..."
    }
    else {
        Write-Host "Assignment failed: $($_.Exception.Message)"
    }
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
