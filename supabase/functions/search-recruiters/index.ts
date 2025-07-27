import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SearchRequest {
  companyInput: string;
}

interface RawContact {
  email: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  provider: string;
}

interface EmailProvider {
  name: string;
  // --- CHANGE 1: The function now accepts companyName for more accurate searches ---
  findAllEmails: (
    domain: string,
    companyName: string
  ) => Promise<{ contacts: RawContact[]; error?: string }>;
}

const createEmailProviders = (): EmailProvider[] => {
  const providers: EmailProvider[] = [];

  // Hunter.io Provider (mostly uses domain, so it's less affected but we'll keep the signature consistent)
  const hunterApiKey = Deno.env.get("HUNTER_API_KEY");
  if (hunterApiKey) {
    providers.push({
      name: "Hunter.io",
      findAllEmails: async (domain: string, _companyName: string) => {
        // companyName is ignored here
        try {
          const response = await fetch(
            `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${hunterApiKey}`,
            { method: "GET" }
          );
          if (!response.ok)
            return {
              contacts: [],
              error: `Hunter.io API error: HTTP ${response.status}`,
            };
          const data = await response.json();
          const contacts: RawContact[] = [];
          data.data?.emails?.forEach((emailInfo: any) => {
            contacts.push({
              email: emailInfo.value,
              firstName: emailInfo.first_name || "Contact",
              lastName: emailInfo.last_name || "Person",
              title: emailInfo.position || "Employee",
              provider: "Hunter.io",
            });
          });
          return { contacts };
        } catch (error) {
          return { contacts: [], error: error.message };
        }
      },
    });
  }

  // RocketReach Provider
  const rocketreachApiKey = Deno.env.get("ROCKETREACH_API_KEY");
  if (rocketreachApiKey) {
    providers.push({
      name: "RocketReach",
      // --- CHANGE 2: This function now uses the accurate companyName for its query ---
      findAllEmails: async (domain: string, companyName: string) => {
        try {
          // We use a broader query here to increase chances of finding someone
          const response = await fetch(
            "https://api.rocketreach.co/v2/api/search",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Api-Key": rocketreachApiKey,
              },
               body: JSON.stringify({
                 query: {
                   // Using companyName is more reliable than domain parts
                   current_employer: [companyName],
                 },
                 start: 1,
                 size: 100, // Get up to 100 profiles to maximize results
               }),
            }
          );

          if (!response.ok)
            return {
              contacts: [],
              error: `RocketReach API error: HTTP ${response.status}`,
            };

          const data = await response.json();
          const contacts: RawContact[] = [];
          data.profiles?.forEach((profile: any) => {
            if (
              profile.emails &&
              profile.emails.length > 0 &&
              profile.emails[0].email
            ) {
              contacts.push({
                email: profile.emails[0].email,
                firstName: profile.first_name || "HR",
                lastName: profile.last_name || "Contact",
                title: profile.current_title || "Recruiter",
                provider: "RocketReach",
              });
            }
          });
          return { contacts };
        } catch (error) {
          return { contacts: [], error: error.message };
        }
      },
    });
  }

  return providers;
};

// --- CHANGE 3: The main finder function now accepts and passes companyName ---
const findAllEmailsFromDomain = async (
  domain: string,
  companyName: string
): Promise<RawContact[]> => {
  const providers = createEmailProviders();
  if (providers.length === 0) {
    console.log("No email providers configured.");
    return [];
  }

  // Pass both domain and companyName to each provider
  const results = await Promise.all(
    providers.map((provider) => {
      console.log(`Querying ${provider.name} for company: ${companyName}`);
      return provider.findAllEmails(domain, companyName);
    })
  );

  const uniqueContacts = new Map<string, RawContact>();
  results.forEach((result) => {
    result.contacts?.forEach((contact) => {
      if (contact.email && !uniqueContacts.has(contact.email)) {
        uniqueContacts.set(contact.email, contact);
      }
    });
    if (result.error) console.error(result.error);
  });

  return Array.from(uniqueContacts.values());
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyInput }: SearchRequest = await req.json();
    if (!companyInput) {
      return new Response(
        JSON.stringify({ error: "Company name or domain is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const isDomain = companyInput.includes(".");
    const domain = isDomain
      ? companyInput.toLowerCase()
      : `${companyInput.toLowerCase().replace(/[\s,.]+/g, "")}.com`;
    const companyName = isDomain
      ? domain.split(".")[0].charAt(0).toUpperCase() +
        domain.split(".")[0].slice(1)
      : companyInput;

    console.log(
      `Searching for recruiters - Company: ${companyName}, Domain: ${domain}`
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let { data: companyRecord } = await supabase
      .from("companies")
      .select("*")
      .eq("domain", domain)
      .single();

    if (!companyRecord) {
      const { data: newCompany, error } = await supabase
        .from("companies")
        .insert({ name: companyName, domain, location: "United States" })
        .select()
        .single();
      if (error) throw new Error(`Failed to create company: ${error.message}`);
      companyRecord = newCompany;
    }

    // --- CHANGE 4: Pass both domain and companyName to the finder function ---
    const allFoundContacts = await findAllEmailsFromDomain(domain, companyName);
    console.log(
      `Found a total of ${allFoundContacts.length} unique potential contacts from all providers.`
    );

    const recruiters: any[] = [];
    if (allFoundContacts.length > 0) {
      for (const contact of allFoundContacts) {
        const { data: existingRecruiter } = await supabase
          .from("recruiters")
          .select("*")
          .eq("company_id", companyRecord.id)
          .eq("email", contact.email)
          .maybeSingle();

        if (existingRecruiter) {
          recruiters.push({
            ...existingRecruiter,
            email_provider: contact.provider,
            status: "existing",
          });
        } else {
          const { data: newRecruiter, error } = await supabase
            .from("recruiters")
            .insert({
              company_id: companyRecord.id,
              first_name: contact.firstName,
              last_name: contact.lastName,
              email: contact.email,
              title: contact.title,
              email_status: "valid",
            })
            .select()
            .single();

          if (error)
            console.error(`Error creating recruiter ${contact.email}:`, error);
          else if (newRecruiter)
            recruiters.push({
              ...newRecruiter,
              email_provider: contact.provider,
              status: "new",
            });
        }
      }
    }

    const message =
      recruiters.length > 0
        ? `Found and processed ${recruiters.length} recruiter contacts.`
        : "No recruiter emails were found by the configured providers.";
    return new Response(
      JSON.stringify({
        company: companyRecord,
        recruiters,
        totalFound: recruiters.length,
        message,
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error in handler function:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
