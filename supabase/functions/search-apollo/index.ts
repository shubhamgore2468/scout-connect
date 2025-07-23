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
      return new Response(
        JSON.stringify({ error: `Failed to fetch contacts: ${contactSearchResponse.status}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const contactData = await contactSearchResponse.json();
    console.log(`Found ${contactData.people?.length || 0} contacts`);

    // Step 4: Save recruiters to database
    const recruiters = [];
    if (contactData.people && contactData.people.length > 0) {
      for (const person of contactData.people) {
        if (person.email) {
          try {
            const { data: existingRecruiter, error: recruiterFetchError } = await supabase
              .from('recruiters')
              .select('*')
              .eq('company_id', companyRecord.id)
              .eq('email', person.email)
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
                  email_status: person.email_status || 'unknown',
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingRecruiter.id)
                .select()
                .single();

              if (!updateError) {
                recruiters.push(updatedRecruiter);
              }
            } else {
              // Create new recruiter
              const { data: newRecruiter, error: insertError } = await supabase
                .from('recruiters')
                .insert({
                  company_id: companyRecord.id,
                  email: person.email,
                  first_name: person.first_name,
                  last_name: person.last_name,
                  title: person.title,
                  department: person.functions?.[0],
                  linkedin_url: person.linkedin_url,
                  apollo_contact_id: person.id,
                  email_status: person.email_status || 'unknown'
                })
                .select()
                .single();

              if (!insertError) {
                recruiters.push(newRecruiter);
              }
            }
          } catch (error) {
            console.error('Error saving recruiter:', error);
            // Continue with other recruiters
          }
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