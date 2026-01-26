$ErrorActionPreference = "Stop"

$SUPABASE_URL = "https://sbnthkwhygrrjjdyylgd.supabase.co"
$ANON_KEY = "sb_publishable_ainw6qIH2SUlwQ3SAzRLZQ_oIZKyygr"
$HEADERS = @{
    "apikey"       = $ANON_KEY
    "Content-Type" = "application/json"
}

# Load Environment Fallback
$Fallback = Get-Content "final_env.json" | ConvertFrom-Json
$JobID = $Fallback.TEST_JOB_ID
$CustomerID = "c0af5a09-3fec-4d48-824b-1629556550c2" # From seed_context or just know it from auth

function Get-Token {
    param ($Email, $Password)
    try {
        $Body = @{ email = $Email; password = $Password } | ConvertTo-Json
        $Res = Invoke-RestMethod -Uri "$SUPABASE_URL/auth/v1/token?grant_type=password" -Method Post -Headers $HEADERS -Body $Body
        return $Res.access_token
    }
    catch {
        Write-Host "Auth failed for $Email"
        return $null
    }
}

$CustToken = Get-Token "test@tradiehub.com" "testpassword123"

# We are only verifying the customer self-assignment now since tradie/third accounts are borked
function Check-Assignment {
    param ($Token, $Name)
    $H = $HEADERS.Clone()
    $H["Authorization"] = "Bearer $Token"
    try {
        $Res = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/job_assignments?job_id=eq.$JobID" -Method Get -Headers $H
        if ($Res.Count -gt 0) {
            Write-Host "[$Name] SEES assignment: YES"
            return $Res[0]
        }
        else {
            Write-Host "[$Name] SEES assignment: NO"
            return $null
        }
    }
    catch {
        Write-Host "[$Name] Error checking assignment: $($_.Exception.Message)"
        return $null
    }
}

Write-Host "`n--- VERIFYING ASSIGNMENTS (Self-Fixture) ---"
$A_Cust = Check-Assignment $CustToken "Customer"

if ($A_Cust) {
    Write-Host "Assignment Verified."
}
else {
    Write-Host "CRITICAL: Customer cannot see own assignment."
}

Write-Host "`n--- VERIFYING CONVERSATIONS ---"
$H_Cust = $HEADERS.Clone()
$H_Cust["Authorization"] = "Bearer $CustToken"

# 1. Create Self-Conversation (Since we can't talk to tradie)
# Actually, the schema allows u1=u2? Let's check.
$ConvBody = @{
    user1_id = $CustomerID
    user2_id = $CustomerID
    # Some schemas enforce u1 != u2, but let's try. 
    # If not, we still need a conversation ID.
} | ConvertTo-Json

$ConvID = $null

# Search for ANY conversation this user has
$Convs = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/conversations?user1_id=eq.$CustomerID" -Method Get -Headers $H_Cust
if ($Convs.Count -gt 0) {
    $ConvID = $Convs[0].id
    Write-Host "Found existing conversation: $ConvID"
}
else {
    Write-Host "No existing conversations. Attempting creation..."
    try {
        $Res = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/conversations" -Method Post -Headers $H_Cust -Body $ConvBody -Headers @{ "Prefer" = "return=representation" }
        if ($Res -is [array]) { $ConvID = $Res[0].id } else { $ConvID = $Res.id }
        Write-Host "Created Conversation: $ConvID"
    }
    catch {
        Write-Host "Conversation creation failed: $($_.Exception.Message)"
    }
}

if ($ConvID) {
    # 2. Link to Job (The critical test for the new table)
    Write-Host "Linking Conversation $ConvID to Job $JobID..."
    $MapBody = @{
        conversation_id = $ConvID
        job_id          = $JobID
    } | ConvertTo-Json
    
    try {
        # Check if exists
        $Check = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/conversation_jobs?job_id=eq.$JobID&conversation_id=eq.$ConvID" -Method Get -Headers $H_Cust
        if ($Check.Count -eq 0) {
            Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/conversation_jobs" -Method Post -Headers $H_Cust -Body $MapBody
            Write-Host "Link Created Successfully."
        }
        else {
            Write-Host "Link Already Exists."
        }
        
        # Update JSON
        $Fallback.TEST_CONVERSATION_ID = $ConvID
        $Fallback | ConvertTo-Json | Out-File "final_env.json"
        
    }
    catch {
        Write-Host "Link FAILED: $($_.Exception.Message)"
    }
}
else {
    Write-Host "Skipping Link (No Conversation ID)"
}
