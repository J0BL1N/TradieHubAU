$ErrorActionPreference = "Stop"

$SUPABASE_URL = "https://sbnthkwhygrrjjdyylgd.supabase.co"
$ANON_KEY = "sb_publishable_ainw6qIH2SUlwQ3SAzRLZQ_oIZKyygr"
$HEADERS = @{
    "apikey"       = $ANON_KEY
    "Content-Type" = "application/json"
}

function SignUp-User {
    param (
        [string]$Email,
        [string]$Password,
        [string]$Role
    )

    Write-Host "Signing up $Email..."
    $Body = @{
        email    = $Email
        password = $Password
        data     = @{ role = $Role } # Try metadata first, might not stick to table
    } | ConvertTo-Json

    try {
        $Response = Invoke-RestMethod -Uri "$SUPABASE_URL/auth/v1/signup" -Method Post -Headers $HEADERS -Body $Body
        $UserID = $Response.id
        if (-not $UserID) { $UserID = $Response.user.id }
        
        Write-Host "Created $Email with ID: $UserID"
        
        # We need the JWT to create/update the profile ourselves if not auto-created
        $JWT = $Response.access_token
        
        if ($JWT) {
            # Insert into public.users
            $UserHeaders = $HEADERS.Clone()
            $UserHeaders["Authorization"] = "Bearer $JWT"
            
            $ProfileBody = @{
                id           = $UserID
                email        = $Email
                role         = $Role
                display_name = $Email.Split("@")[0]
            } | ConvertTo-Json

            Write-Host "Upserting profile for $Email with role $Role..."
            # Using UPSERT (POST with Prefer: resolution=merge-duplicates)
            $UpsertHeaders = $UserHeaders.Clone()
            $UpsertHeaders["Prefer"] = "resolution=merge-duplicates"
            
            Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/users" -Method Post -Headers $UpsertHeaders -Body $ProfileBody
            Write-Host "Profile upserted."
        }
        else {
            Write-Host "WARNING: No access token returned. Confirmation might be required."
        }

        return @{ ID = $UserID; Email = $Email; Role = $Role }

    }
    catch {
        Write-Host "Error signing up $Email"
        Write-Host $_.Exception.Message
        # Check if user already exists
        if ($_.Exception.Message -match "User already registered") {
            Write-Host "User exists, attempting login to get ID..."
            try {
                $LoginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
                $Login = Invoke-RestMethod -Uri "$SUPABASE_URL/auth/v1/token?grant_type=password" -Method Post -Headers $HEADERS -Body $LoginBody
                return @{ ID = $Login.user.id; Email = $Email; Role = $Role }
            }
            catch {
                Write-Host "Login failed too."
                return $null
            }
        }
        return $null
    }
}

$Tradie = SignUp-User -Email "tradie_test@tradiehub.com" -Password "TradieTest123!" -Role "tradie"
$Third = SignUp-User -Email "third_test@tradiehub.com" -Password "ThirdTest123!" -Role "customer"

# Update Context
$Context = Get-Content "seed_context.json" | ConvertFrom-Json
$Context | Add-Member -NotePropertyName "TradieID" -NotePropertyValue $Tradie.ID
$Context | Add-Member -NotePropertyName "ThirdID" -NotePropertyValue $Third.ID

$Context | ConvertTo-Json | Out-File "seed_context.json"

Write-Host "Tradie ID: $($Tradie.ID)"
Write-Host "Third ID: $($Third.ID)"
