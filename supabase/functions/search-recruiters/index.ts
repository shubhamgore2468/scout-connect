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

// A raw contact found from an API provider
interface RawContact {
  email: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  provider: string;
}

interface EmailProvider {
  name: string;
  // The function should now return a promise that resolves to an array of all contacts found
  findAllEmails: (
    domain: string
  ) => Promise<{ contacts: RawContact[]; error?: string }>;
}

// --- Enhanced Email Provider Implementations ---
const createEmailProviders = (): EmailProvider[] => {
  const providers: EmailProvider[] = [];

  // Hunter.io - Now processes all relevant emails from the domain search
  const hunterApiKey = Deno.env.get("HUNTER_API_KEY");
  if (hunterApiKey) {
    providers.push({
      name: "Hunter.io",
      findAllEmails: async (domain: string) => {
        try {
          const response = await fetch(
            `https://api.hunter.io/v2/domain-search?domain=${domain}&department=hr,recruiting,talent&api_key=${hunterApiKey}`,
            { method: "GET" }
          );

          if (!response.ok) {
            return {
              contacts: [],
              error: `Hunter.io API error: HTTP ${response.status}`,
            };
          }

          const data = await response.json();
          const contacts: RawContact[] = [];

          // Process ALL emails returned from the API
          data.data?.emails?.forEach((emailInfo: any) => {
            // Filter for relevant roles
            const position = emailInfo.position?.toLowerCase() || "";
            const department = emailInfo.department?.toLowerCase() || "";
            if (
              department.includes("hr") ||
              department.includes("human resources") ||
              position.includes("recruit") ||
              position.includes("talent")
            ) {
              contacts.push({
                email: emailInfo.value,
                firstName: emailInfo.first_name || "HR",
                lastName: emailInfo.last_name || "Contact",
                title: emailInfo.position || "Recruiter",
                provider: "Hunter.io",
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

  // RocketReach - Now processes all profiles from the search
  const rocketreachApiKey = Deno.env.get("ROCKETREACH_API_KEY");
  if (rocketreachApiKey) {
    providers.push({
      name: "RocketReach",
      findAllEmails: async (domain: string) => {
        try {
          const response = await fetch(
            "https://api.rocketreach.co/v1/api/search",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Api-Key": rocketreachApiKey,
              },
              body: JSON.stringify({
                query: {
                  current_employer: [domain.split(".")[0]], // Using company name from domain
                  title: [
                    "recruiter",
                    "talent acquisition",
                    "hr manager",
                    "human resources",
                    "talent",
                  ],
                },
              }),
            }
          );

          if (!response.ok) {
            return {
              contacts: [],
              error: `RocketReach API error: HTTP ${response.status}`,
            };
          }

          const data = await response.json();
          const contacts: RawContact[] = [];

          // Process ALL profiles returned from the API
          data.profiles?.forEach((profile: any) => {
            if (profile.emails && profile.emails.length > 0) {
              contacts.push({
                email: profile.emails[0].email, // Assuming the first email is the most relevant
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

// --- New function to find all emails from all providers ---
const findAllEmailsFromDomain = async (
  domain: string
): Promise<RawContact[]> => {
  const providers = createEmailProviders();
  if (providers.length === 0) {
    console.log("No email providers configured.");
    return [];
  }

  // Use Promise.all to query all providers simultaneously for better performance
  const results = await Promise.all(
    providers.map((provider) => {
      console.log(`Querying ${provider.name} for domain: ${domain}`);
      return provider.findAllEmails(domain);
    })
  );

  // Use a Map to store unique emails, ensuring no duplicates are processed
  const uniqueContacts = new Map<string, RawContact>();

  results.forEach((result) => {
    if (result.contacts) {
      result.contacts.forEach((contact) => {
        if (!uniqueContacts.has(contact.email)) {
          uniqueContacts.set(contact.email, contact);
        }
      });
    }
    if (result.error) {
      console.error(result.error);
    }
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
      ? companyInput
      : `${companyInput.toLowerCase().replace(/\s+/g, "")}.com`;
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

    // Check for existing company or create a new one
    let { data: companyRecord } = await supabase
      .from("companies")
      .select("*")
      .eq("domain", domain)
      .single();

    if (!companyRecord) {
      console.log(`Creating new company: ${companyName}`);
      const { data: newCompany, error: insertError } = await supabase
        .from("companies")
        .insert({
          name: companyName,
          domain: domain,
          location: "United States",
        })
        .select()
        .single();
      if (insertError)
        throw new Error(`Failed to create company: ${insertError.message}`);
      companyRecord = newCompany;
    } else {
      console.log(`Using existing company: ${companyRecord.name}`);
    }

    // Find all possible recruiter emails from all configured providers
    const allFoundContacts = await findAllEmailsFromDomain(domain);
    console.log(
      `Found a total of ${allFoundContacts.length} unique potential contacts from all providers.`
    );

    const recruiters: any[] = [];
    if (allFoundContacts.length > 0) {
      for (const contact of allFoundContacts) {
        // Check if this specific recruiter email already exists for this company
        const { data: existingRecruiter } = await supabase
          .from("recruiters")
          .select("id")
          .eq("company_id", companyRecord.id)
          .eq("email", contact.email)
          .maybeSingle();

        if (!existingRecruiter) {
          console.log(`Adding new recruiter: ${contact.email}`);
          const { data: newRecruiter, error } = await supabase
            .from("recruiters")
            .insert({
              company_id: companyRecord.id,
              first_name: contact.firstName,
              last_name: contact.lastName,
              email: contact.email,
              title: contact.title,
              email_status: "valid", // Assume valid for now, verification can be a separate step
            })
            .select()
            .single();

          if (error) {
            console.error(`Error creating recruiter ${contact.email}:`, error);
          } else {
            recruiters.push({
              ...newRecruiter,
              email_provider: contact.provider,
            });
          }
        } else {
          console.log(`Recruiter ${contact.email} already exists. Skipping.`);
        }
      }
    }

    const message =
      recruiters.length > 0
        ? `Successfully added ${recruiters.length} new recruiter contacts!`
        : "No new recruiter emails were found or added. They may already exist in the database.";

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
