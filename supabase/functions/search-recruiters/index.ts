import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchRequest {
  companyInput: string;
}

interface EmailProvider {
  name: string;
  findEmail: (department: string, domain: string) => Promise<{ email: string | null; status: string; error?: string }>;
}

// Email provider implementations
const createEmailProviders = (): EmailProvider[] => {
  const providers: EmailProvider[] = [];

  // Hunter.io - Use domain search for HR/recruiting roles
  const hunterApiKey = Deno.env.get('HUNTER_API_KEY');
  if (hunterApiKey) {
    providers.push({
      name: 'Hunter.io',
      findEmail: async (department: string, domain: string) => {
        try {
          // Use domain search to find emails related to HR/recruiting
          const response = await fetch(
            `https://api.hunter.io/v2/domain-search?domain=${domain}&department=${department}&api_key=${hunterApiKey}`,
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
          // Look for HR/recruiting related emails
          const hrEmails = data.data?.emails?.filter((email: any) => 
            email.department === 'hr' || 
            email.department === 'human resources' ||
            email.position?.toLowerCase().includes('recruit') ||
            email.position?.toLowerCase().includes('talent') ||
            email.position?.toLowerCase().includes('hr')
          );
          
          const foundEmail = hrEmails?.[0]?.value || data.data?.emails?.[0]?.value;
          return {
            email: foundEmail || null,
            status: foundEmail ? 'found' : 'not_found'
          };
        } catch (error) {
          return { email: null, status: 'error', error: error.message };
        }
      }
    });
  }

  // RocketReach - Search by job title keywords
  const rocketreachApiKey = Deno.env.get('ROCKETREACH_API_KEY');
  if (rocketreachApiKey) {
    providers.push({
      name: 'RocketReach',
      findEmail: async (department: string, domain: string) => {
        try {
          const response = await fetch('https://api.rocketreach.co/v1/api/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Api-Key': rocketreachApiKey
            },
            body: JSON.stringify({
              query: {
                current_employer: [domain.split('.')[0]],
                title: [department, 'recruiter', 'talent acquisition', 'hr manager', 'human resources']
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

  return providers;
};

// Multi-provider email finder with automatic fallback
const findEmailWithFallback = async (department: string, domain: string): Promise<{ email: string | null; status: string; provider?: string }> => {
  const providers = createEmailProviders();
  
  if (providers.length === 0) {
    return { email: null, status: 'no_providers', provider: 'none' };
  }

  for (const provider of providers) {
    console.log(`Trying ${provider.name} for ${department} department at ${domain}`);
    
    const result = await provider.findEmail(department, domain);
    
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
    const { companyInput }: SearchRequest = await req.json();
    
    if (!companyInput) {
      return new Response(
        JSON.stringify({ error: "Company name or domain is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Determine if input is a domain or company name
    const isDomain = companyInput.includes('.');
    let domain: string;
    let companyName: string;
    
    if (isDomain) {
      domain = companyInput;
      // Extract company name from domain
      companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
    } else {
      companyName = companyInput;
      // Generate domain from company name
      domain = `${companyName.toLowerCase().replace(/\s+/g, '')}.com`;
    }

    console.log(`Searching for recruiters - Company: ${companyName}, Domain: ${domain}`);

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

    // Check if company already exists
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('*')
      .or(`name.ilike.%${companyName}%,domain.eq.${domain}`)
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
          domain: domain,
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

    // HR/recruiting departments to search for
    const hrDepartments = [
      'hr', 'human resources', 'recruiting', 'talent acquisition', 
      'university recruiting', 'early careers', 'people operations',
      'talent', 'careers', 'recruitment'
    ];

    const recruiters = [];
    console.log(`Searching for HR/recruiting contacts at domain: ${domain}`);

    // Try to find emails using the email providers for each department
    for (const department of hrDepartments) {
      console.log(`Searching for ${department} contacts`);
      
      const emailResult = await findEmailWithFallback(department, domain);
      
      if (emailResult.email) {
        console.log(`Found email via ${emailResult.provider}: ${emailResult.email}`);
        
        // Check if recruiter already exists
        const { data: existingRecruiter } = await supabase
          .from('recruiters')
          .select('*')
          .eq('company_id', companyRecord.id)
          .eq('email', emailResult.email)
          .maybeSingle();

        if (!existingRecruiter) {
          // Map provider status to valid database values
          let dbEmailStatus = 'unknown';
          if (emailResult.status === 'found' || emailResult.status === 'high_confidence') {
            dbEmailStatus = 'valid';
          } else if (emailResult.status === 'low_confidence') {
            dbEmailStatus = 'risky';
          }

          // Create new recruiter
          const { data: newRecruiter, error: insertError } = await supabase
            .from('recruiters')
            .insert({
              company_id: companyRecord.id,
              first_name: department.charAt(0).toUpperCase() + department.slice(1),
              last_name: 'Contact',
              email: emailResult.email,
              title: `${department.charAt(0).toUpperCase() + department.slice(1)} Department`,
              email_status: dbEmailStatus,
            })
            .select()
            .single();

          if (!insertError) {
            recruiters.push({ ...newRecruiter, email_provider: emailResult.provider });
          } else {
            console.error('Error creating recruiter:', insertError);
          }
        } else {
          recruiters.push({ ...existingRecruiter, email_provider: emailResult.provider });
        }
      } else {
        console.log(`No email found for ${department} department`);
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