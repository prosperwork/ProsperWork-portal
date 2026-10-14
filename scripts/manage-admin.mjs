import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const targetEmail = "stephenmatthew170@gmail.com".toLowerCase().trim();

async function run() {
  console.log(`Checking accounts for ${targetEmail}...`);

  // 1. Check pw_profiles
  const { data: profile, error: profileErr } = await admin
    .from("pw_profiles")
    .select("id, name, email, role, status")
    .eq("email", targetEmail)
    .maybeSingle();

  if (profileErr) {
    console.error("Error fetching pw_profiles:", profileErr);
  }

  console.log("Current profile:", profile);

  // 2. Check auth.users
  const { data: { users }, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) {
    console.error("Error listing auth users:", listErr);
  }

  const authUser = users?.find(u => u.email?.toLowerCase() === targetEmail);
  console.log("Current auth user:", authUser ? { id: authUser.id, email: authUser.email, confirmed_at: authUser.email_confirmed_at } : null);

  if (!authUser && !profile) {
    console.log("User does not exist in Auth or Profiles. Inviting user...");
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(targetEmail, {
      data: { name: "Stephen Matthew" },
      redirectTo: "https://portal.prosperworkmusic.com/auth/confirm?next=/reset-password&reason=invite"
    });

    if (inviteErr) {
      console.error("Error inviting user:", inviteErr);
      process.exit(1);
    }

    console.log("Invited user successfully:", inviteData.user?.id);

    const userId = inviteData.user.id;

    // Insert or update profile
    const { error: upsertErr } = await admin.from("pw_profiles").upsert({
      id: userId,
      email: targetEmail,
      name: "Stephen Matthew",
      role: "super_admin",
      status: "active",
      timezone: "UTC",
    });

    if (upsertErr) {
      console.error("Error upserting profile as super_admin:", upsertErr);
      process.exit(1);
    }
    console.log("Profile created and set to super_admin successfully!");
  } else {
    const userId = profile?.id || authUser?.id;
    console.log(`Updating existing profile ${userId} to super_admin...`);

    const { error: updateErr } = await admin
      .from("pw_profiles")
      .upsert({
        id: userId,
        email: targetEmail,
        name: profile?.name || authUser?.user_metadata?.name || "Stephen Matthew",
        role: "super_admin",
        status: "active",
      });

    if (updateErr) {
      console.error("Error updating profile to super_admin:", updateErr);
      process.exit(1);
    }
    console.log("Profile successfully updated to super_admin with active status!");

    if (!authUser) {
      console.log("Sending invitation email to set password...");
      const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(targetEmail, {
        data: { name: profile?.name || "Stephen Matthew" },
        redirectTo: "https://portal.prosperworkmusic.com/auth/confirm?next=/reset-password&reason=invite"
      });
      if (inviteErr) {
        console.warn("Notice: Auth invite returned:", inviteErr.message);
      } else {
        console.log("Invite sent:", inviteData.user?.id);
      }
    }
  }

  // Verify final profile
  const { data: finalProfile } = await admin
    .from("pw_profiles")
    .select("id, name, email, role, status")
    .eq("email", targetEmail)
    .single();

  console.log("Final verified profile:", finalProfile);
}

run().catch(console.error);

