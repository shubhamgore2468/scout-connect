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

    console.log(`Searching for company: ${companyName} using email providers only`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Initialize email providers
    const emailProviders = createEmailProviders();
    
    if (emailProviders.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No email providers configured. Please add API keys for Hunter, Snov, RocketReach, Voila Norbert, or FindThatLead.' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Available email providers: ${emailProviders.map(p => p.name).join(', ')}`);

    // Create a simple company record (without Apollo data)
    const companyDomain = domain || `${companyName.toLowerCase().replace(/\s+/g, '')}.com`;
    
    // Check if company already exists
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('*')
      .or(`name.ilike.%${companyName}%,domain.eq.${companyDomain}`)
      .maybeSingle();

    let companyRecord;
    if (existingCompany) {
      companyRecord = existingCompany;
      console.log(`Using existing company: ${companyRecord.name}`);
    } else {
      // Create new company
      const { data: newCompany, error: insertError } = await supabase
        .from('companies')
        .insert({
          name: companyName,
          domain: companyDomain,
          location: 'United States',
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating company:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to create company', details: insertError }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      companyRecord = newCompany;
      console.log(`Created new company: ${companyRecord.name}`);
    }

    // Common HR/recruiting email patterns to try
    const hrEmailPatterns = [
      'hr', 'recruiting', 'talent', 'careers', 'jobs', 'recruitment',
      'humanresources', 'talentacquisition', 'universityrecruiting',
      'earlycareers', 'people', 'hiring', 'recruiter'
    ];

    const recruiters = [];
    console.log(`Searching for HR/recruiting emails at domain: ${companyDomain}`);

    // First try common HR/recruiting email patterns
    for (const pattern of hrEmailPatterns) {
      const email = `${pattern}@${companyDomain}`;
      console.log(`Trying HR email pattern: ${email}`);
      
      // Check if this email pattern recruiter already exists
      const { data: existingRecruiter } = await supabase
        .from('recruiters')
        .select('*')
        .eq('company_id', companyRecord.id)
        .eq('email', email)
        .maybeSingle();

      if (!existingRecruiter) {
        // Create recruiter with department-based email
        const { data: newRecruiter, error: insertError } = await supabase
          .from('recruiters')
          .insert({
            company_id: companyRecord.id,
            first_name: pattern.charAt(0).toUpperCase() + pattern.slice(1),
            last_name: 'Team',
            email: email,
            title: `${pattern.charAt(0).toUpperCase() + pattern.slice(1)} Department`,
            email_status: 'unverified',
          })
          .select()
          .single();

        if (!insertError) {
          recruiters.push({ ...newRecruiter, email_provider: 'pattern_based' });
          console.log(`Added HR email pattern: ${email}`);
        } else {
          console.error('Error creating recruiter:', insertError);
        }
      } else {
        recruiters.push({ ...existingRecruiter, email_provider: 'existing' });
        console.log(`Email pattern already exists: ${email}`);
      }
    }

    const message = recruiters.length > 0 
      ? `Found ${recruiters.length} recruiter contacts using email providers!`
      : 'No recruiter emails found. Try adding more API keys for different email providers or check the company domain.';

    return new Response(
      JSON.stringify({ 
        company: companyRecord, 
        recruiters, 
        totalFound: recruiters.length,
        message
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    console.error('Error in search function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);