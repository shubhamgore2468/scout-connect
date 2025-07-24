import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchRequest {
  companyName: string;
  domain?: string;
}

interface EmailProvider {
  name: string;
  findEmail: (firstName: string, lastName: string, domain: string) => Promise<{ email: string | null; status: string; error?: string }>;
}

// Email provider implementations
const createEmailProviders = (): EmailProvider[] => {
  const providers: EmailProvider[] = [];

  // Hunter.io
  const hunterApiKey = Deno.env.get('HUNTER_API_KEY');
  if (hunterApiKey) {
    providers.push({
      name: 'Hunter.io',
      findEmail: async (firstName: string, lastName: string, domain: string) => {
        try {
          const response = await fetch(
            `https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${firstName}&last_name=${lastName}&api_key=${hunterApiKey}`,
            { method: 'GET' }
          );
          
          if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 401 || errorText.includes('limit') || errorText.includes('quota')) {
              return { email: null, status: 'limit_reached', error: 'API limit reached' };
            }
            return { email: null, status: 'error', error: `HTTP ${response.status}` };
          }

          const data = await response.json();
          return {
            email: data.data?.email || null,
            status: data.data?.confidence > 70 ? 'high_confidence' : 'low_confidence'
          };
        } catch (error) {
          return { email: null, status: 'error', error: error.message };
        }
      }
    });
  }

  // Snov.io
  const snovApiKey = Deno.env.get('SNOV_API_KEY');
  if (snovApiKey) {
    providers.push({
      name: 'Snov.io',
      findEmail: async (firstName: string, lastName: string, domain: string) => {
        try {
          const response = await fetch('https://app.snov.io/restapi/get-emails-from-names', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${snovApiKey}`
            },
            body: JSON.stringify({
              firstName,
              lastName,
              domain
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 402 || errorText.includes('limit') || errorText.includes('quota')) {
              return { email: null, status: 'limit_reached', error: 'API limit reached' };
            }
            return { email: null, status: 'error', error: `HTTP ${response.status}` };
          }

          const data = await response.json();
          return {
            email: data.emails?.[0]?.email || null,
            status: data.emails?.[0]?.email ? 'found' : 'not_found'
          };
        } catch (error) {
          return { email: null, status: 'error', error: error.message };
        }
      }
    });
  }

  // RocketReach
  const rocketreachApiKey = Deno.env.get('ROCKETREACH_API_KEY');
  if (rocketreachApiKey) {
    providers.push({
      name: 'RocketReach',
      findEmail: async (firstName: string, lastName: string, domain: string) => {
        try {
          const response = await fetch('https://api.rocketreach.co/v1/api/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Api-Key': rocketreachApiKey
            },
            body: JSON.stringify({
              query: {
                name: [`${firstName} ${lastName}`],
                current_employer: [domain.split('.')[0]]
              }
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 429 || errorText.includes('limit') || errorText.includes('quota')) {
              return { email: null, status: 'limit_reached', error: 'API limit reached' };
            }
            return { email: null, status: 'error', error: `HTTP ${response.status}` };
          }

          const data = await response.json();
          const email = data.profiles?.[0]?.emails?.[0]?.email;
          return {
            email: email || null,
            status: email ? 'found' : 'not_found'
          };
        } catch (error) {
          return { email: null, status: 'error', error: error.message };
        }
      }
    });
  }

  // Voila Norbert
  const voilaNorbertApiKey = Deno.env.get('VOILA_NORBERT_API_KEY');
  if (voilaNorbertApiKey) {
    providers.push({
      name: 'Voila Norbert',
      findEmail: async (firstName: string, lastName: string, domain: string) => {
        try {
          const response = await fetch('https://api.voilanorbert.com/2018-01-08/search/name', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${voilaNorbertApiKey}`
            },
            body: JSON.stringify({
              name: `${firstName} ${lastName}`,
              domain
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 402 || errorText.includes('limit') || errorText.includes('quota')) {
              return { email: null, status: 'limit_reached', error: 'API limit reached' };
            }
            return { email: null, status: 'error', error: `HTTP ${response.status}` };
          }

          const data = await response.json();
          return {
            email: data.email?.email || null,
            status: data.email?.score > 70 ? 'high_confidence' : 'low_confidence'
          };
        } catch (error) {
          return { email: null, status: 'error', error: error.message };
        }
      }
    });
  }

  // FindThatLead
  const findThatLeadApiKey = Deno.env.get('FINDTHATLEAD_API_KEY');
  if (findThatLeadApiKey) {
    providers.push({
      name: 'FindThatLead',
      findEmail: async (firstName: string, lastName: string, domain: string) => {
        try {
          const response = await fetch('https://api.findthatlead.com/v1/getEmail', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${findThatLeadApiKey}`
            },
            body: JSON.stringify({
              name: `${firstName} ${lastName}`,
              domain
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 402 || errorText.includes('limit') || errorText.includes('quota')) {
              return { email: null, status: 'limit_reached', error: 'API limit reached' };
            }
            return { email: null, status: 'error', error: `HTTP ${response.status}` };
          }

          const data = await response.json();
          return {
            email: data.email || null,
            status: data.email ? 'found' : 'not_found'
          };
        } catch (error) {
          return { email: null, status: 'error', error: error.message };
        }
      }
    });
  }

  return providers;
};

// Multi-provider email finder with automatic fallback
const findEmailWithFallback = async (firstName: string, lastName: string, domain: string): Promise<{ email: string | null; status: string; provider?: string }> => {
  const providers = createEmailProviders();
  
  if (providers.length === 0) {
    return { email: null, status: 'no_providers', provider: 'none' };
  }

  for (const provider of providers) {
    console.log(`Trying ${provider.name} for ${firstName} ${lastName}@${domain}`);
    
    const result = await provider.findEmail(firstName, lastName, domain);
    
    if (result.email) {
      console.log(`Found email with ${provider.name}: ${result.email}`);
      return { 
        email: result.email, 
        status: result.status, 
        provider: provider.name 
      };
    }
    
    if (result.status === 'limit_reached') {
      console.log(`${provider.name} limit reached, trying next provider...`);
      continue;
    }
    
    // If not found but no limit reached, try next provider anyway
    console.log(`${provider.name} did not find email, trying next provider...`);
  }
  
  return { email: null, status: 'not_found', provider: 'all_exhausted' };
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyName, domain }: SearchRequest = await req.json();
    
    if (!companyName) {
      return new Response(
        JSON.stringify({ error: "Company name is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const apolloApiKey = Deno.env.get('APOLLO_API_KEY');
    if (!apolloApiKey) {
      return new Response(
        JSON.stringify({ error: "Apollo API key not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Searching for company: ${companyName}`);

    // Step 1: Search for company in Apollo
    const companySearchResponse = await fetch('https://api.apollo.io/v1/organizations/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apolloApiKey,
      },
      body: JSON.stringify({
        q_organization_name: companyName,
        page: 1,
        per_page: 1,
        organization_locations: ['United States'],
        ...(domain && { q_organization_domains: [domain] })
      }),
    });

    if (!companySearchResponse.ok) {
      const errorText = await companySearchResponse.text();
      console.error('Apollo company search failed:', errorText);
      return new Response(
        JSON.stringify({ error: `Apollo API error: ${companySearchResponse.status}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const companyData = await companySearchResponse.json();
    
    if (!companyData.organizations || companyData.organizations.length === 0) {
      return new Response(
        JSON.stringify({ error: "Company not found in Apollo database" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const apolloCompany = companyData.organizations[0];
    console.log(`Found company: ${apolloCompany.name} (ID: ${apolloCompany.id})`);

    // Step 2: Save or update company in our database
    const { data: existingCompany, error: companyFetchError } = await supabase
      .from('companies')
      .select('*')
      .eq('apollo_company_id', apolloCompany.id)
      .single();

    let companyRecord;
    if (existingCompany) {
      // Update existing company
      const { data: updatedCompany, error: updateError } = await supabase
        .from('companies')
        .update({
          name: apolloCompany.name,
          domain: apolloCompany.primary_domain,
          industry: apolloCompany.industry,
          size: apolloCompany.estimated_num_employees ? `${apolloCompany.estimated_num_employees} employees` : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingCompany.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating company:', updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update company" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      companyRecord = updatedCompany;
    } else {
      // Create new company
      const { data: newCompany, error: insertError } = await supabase
        .from('companies')
        .insert({
          name: apolloCompany.name,
          domain: apolloCompany.primary_domain,
          industry: apolloCompany.industry,
          size: apolloCompany.estimated_num_employees ? `${apolloCompany.estimated_num_employees} employees` : null,
          apollo_company_id: apolloCompany.id
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating company:', insertError);
        return new Response(
          JSON.stringify({ error: "Failed to save company" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      companyRecord = newCompany;
    }

    // Step 3: Search for recruiters/HR contacts at this company
    const contactSearchResponse = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apolloApiKey,
      },
      body: JSON.stringify({
        q_organization_ids: [apolloCompany.id],
        person_titles: [
          'recruiter', 'recruitment', 'talent acquisition', 'hr', 'human resources',
          'people operations', 'talent partner', 'hiring manager', 'head of talent',
          'director of recruiting', 'vp of people', 'chief people officer'
        ],
        page: 1,
        per_page: 50,
        person_locations: ['United States'],
        reveal_personal_emails: true
      }),
    });

    if (!contactSearchResponse.ok) {
      const errorText = await contactSearchResponse.text();
      console.error('Apollo contact search failed:', errorText);
      
      // Check if it's a plan limitation error
      if (contactSearchResponse.status === 403) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error && errorData.error.includes('not accessible with this api_key on a free plan')) {
            console.log('Free plan detected - returning company without recruiters');
            return new Response(
              JSON.stringify({
                company: companyRecord,
                recruiters: [],
                totalFound: 0,
                message: 'Company found successfully. However, recruiter search requires a paid Apollo.io plan. Please upgrade your Apollo.io subscription to access contact information.'
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json", ...corsHeaders }
              }
            );
          }
        } catch (parseError) {
          // If we can't parse the error, continue with generic error handling
        }
      }
      
      return new Response(
        JSON.stringify({ error: `Failed to fetch contacts: ${contactSearchResponse.status}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const contactData = await contactSearchResponse.json();
    console.log(`Found ${contactData.people?.length || 0} contacts`);

    // Step 4: Process recruiters with multi-provider email finding
    const recruiters = [];
    if (contactData.people && contactData.people.length > 0) {
      for (const person of contactData.people) {
        let finalEmail = person.email;
        let emailStatus = person.email_status || 'unknown';
        let emailProvider = 'Apollo.io';

        // If Apollo doesn't provide email or email is invalid, try other providers
        if (!finalEmail || emailStatus === 'invalid' || emailStatus === 'unknown') {
          if (person.first_name && person.last_name && companyRecord.domain) {
            console.log(`Trying alternative email providers for ${person.first_name} ${person.last_name}`);
            const emailResult = await findEmailWithFallback(
              person.first_name, 
              person.last_name, 
              companyRecord.domain
            );
            
            if (emailResult.email) {
              finalEmail = emailResult.email;
              emailStatus = emailResult.status;
              emailProvider = emailResult.provider || 'Unknown';
              console.log(`Found email via ${emailProvider}: ${finalEmail}`);
            }
          }
        }

        // Only save if we have an email
        if (finalEmail) {
          try {
            const { data: existingRecruiter, error: recruiterFetchError } = await supabase
              .from('recruiters')
              .select('*')
              .eq('company_id', companyRecord.id)
              .eq('email', finalEmail)
              .single();

            if (existingRecruiter) {
              // Update existing recruiter
              const { data: updatedRecruiter, error: updateError } = await supabase
                .from('recruiters')
                .update({
                  first_name: person.first_name,
                  last_name: person.last_name,
                  title: person.title,
                  department: person.functions?.[0],
                  linkedin_url: person.linkedin_url,
                  apollo_contact_id: person.id,
                  email_status: emailStatus,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingRecruiter.id)
                .select()
                .single();

              if (!updateError) {
                // Add provider info to the recruiter object for response
                updatedRecruiter.email_provider = emailProvider;
                recruiters.push(updatedRecruiter);
              }
            } else {
              // Create new recruiter
              const { data: newRecruiter, error: insertError } = await supabase
                .from('recruiters')
                .insert({
                  company_id: companyRecord.id,
                  email: finalEmail,
                  first_name: person.first_name,
                  last_name: person.last_name,
                  title: person.title,
                  department: person.functions?.[0],
                  linkedin_url: person.linkedin_url,
                  apollo_contact_id: person.id,
                  email_status: emailStatus
                })
                .select()
                .single();

              if (!insertError) {
                // Add provider info to the recruiter object for response
                newRecruiter.email_provider = emailProvider;
                recruiters.push(newRecruiter);
              }
            }
          } catch (error) {
            console.error('Error saving recruiter:', error);
            // Continue with other recruiters
          }
        } else {
          console.log(`No email found for ${person.first_name} ${person.last_name} after trying all providers`);
        }
      }
    }

    console.log(`Successfully processed ${recruiters.length} recruiters`);

    return new Response(
      JSON.stringify({
        company: companyRecord,
        recruiters: recruiters,
        totalFound: contactData.people?.length || 0
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      }
    );

  } catch (error: any) {
    console.error('Error in search-apollo function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      }
    );
  }
};

serve(handler);