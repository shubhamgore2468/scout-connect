import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CampaignRequest {
  campaignId: string;
  fromEmail?: string;
  fromName?: string;
}

interface EmailTemplate {
  subject: string;
  content: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { campaignId, fromEmail = "outreach@resend.dev", fromName = "Job Seeker" }: CampaignRequest = await req.json();
    
    if (!campaignId) {
      return new Response(
        JSON.stringify({ error: "Campaign ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "Resend API key not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Initialize Supabase client and Resend
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(resendApiKey);

    console.log(`Starting email campaign: ${campaignId}`);

    // Step 1: Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('email_campaigns')
      .select(`
        *,
        companies (
          name,
          domain
        )
      `)
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      console.error('Campaign not found:', campaignError);
      return new Response(
        JSON.stringify({ error: "Campaign not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (campaign.status !== 'draft') {
      return new Response(
        JSON.stringify({ error: "Campaign is not in draft status" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Step 2: Get recruiters for this campaign
    const { data: recruiters, error: recruitersError } = await supabase
      .from('recruiters')
      .select('*')
      .eq('company_id', campaign.company_id)
      .eq('email_status', 'valid');

    if (recruitersError || !recruiters || recruiters.length === 0) {
      console.error('No valid recruiters found:', recruitersError);
      return new Response(
        JSON.stringify({ error: "No valid recruiters found for this campaign" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Found ${recruiters.length} recruiters to email`);

    // Step 3: Update campaign status to sending
    await supabase
      .from('email_campaigns')
      .update({ 
        status: 'sending',
        total_emails: recruiters.length
      })
      .eq('id', campaignId);

    // Step 4: Send emails to each recruiter
    let emailsSent = 0;
    let emailsDelivered = 0;
    const emailPromises = [];

    for (const recruiter of recruiters) {
      // Personalize the email content
      const personalizedContent = personalizeEmailContent(
        campaign.email_template,
        recruiter,
        campaign.companies,
        campaign.position_title
      );

      const personalizedSubject = personalizeEmailSubject(
        campaign.email_subject,
        recruiter,
        campaign.companies,
        campaign.position_title
      );

      // Create email log entry
      const { data: emailLog, error: logError } = await supabase
        .from('email_logs')
        .insert({
          campaign_id: campaignId,
          recruiter_id: recruiter.id,
          email: recruiter.email,
          subject: personalizedSubject,
          content: personalizedContent,
          status: 'pending'
        })
        .select()
        .single();

      if (logError) {
        console.error('Error creating email log:', logError);
        continue;
      }

      // Send email via Resend
      const emailPromise = sendEmailWithRetry(
        resend,
        {
          from: `${fromName} <${fromEmail}>`,
          to: [recruiter.email],
          subject: personalizedSubject,
          html: personalizedContent,
        },
        supabase,
        emailLog.id
      );

      emailPromises.push(emailPromise);
    }

    // Wait for all emails to be sent
    const results = await Promise.allSettled(emailPromises);
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.sent) emailsSent++;
        if (result.value.delivered) emailsDelivered++;
      }
    }

    console.log(`Campaign completed: ${emailsSent} sent, ${emailsDelivered} delivered`);

    // Step 5: Update campaign with final stats
    await supabase
      .from('email_campaigns')
      .update({
        status: 'completed',
        emails_sent: emailsSent,
        emails_delivered: emailsDelivered
      })
      .eq('id', campaignId);

    return new Response(
      JSON.stringify({
        campaignId,
        totalEmails: recruiters.length,
        emailsSent,
        emailsDelivered,
        status: 'completed'
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      }
    );

  } catch (error: any) {
    console.error('Error in send-campaign function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      }
    );
  }
};

async function sendEmailWithRetry(
  resend: any,
  emailData: any,
  supabase: any,
  emailLogId: string,
  maxRetries = 3
): Promise<{ sent: boolean; delivered: boolean }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Sending email to ${emailData.to[0]} (attempt ${attempt})`);
      
      const emailResponse = await resend.emails.send(emailData);
      
      if (emailResponse.error) {
        throw new Error(emailResponse.error.message);
      }

      // Update email log with success
      await supabase
        .from('email_logs')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', emailLogId);

      console.log(`Email sent successfully to ${emailData.to[0]}`);
      return { sent: true, delivered: true };

    } catch (error: any) {
      console.error(`Attempt ${attempt} failed for ${emailData.to[0]}:`, error);
      console.error('Full error details:', JSON.stringify(error));
      
      if (attempt === maxRetries) {
        // Final failure - update log
        await supabase
          .from('email_logs')
          .update({
            status: 'failed',
            error_message: error.message || JSON.stringify(error)
          })
          .eq('id', emailLogId);
        
        return { sent: false, delivered: false };
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  
  return { sent: false, delivered: false };
}

function personalizeEmailContent(
  template: string,
  recruiter: any,
  company: any,
  positionTitle: string
): string {
  let content = template;
  
  // Replace placeholders
  content = content.replace(/\{recruiter_first_name\}/g, recruiter.first_name || 'there');
  content = content.replace(/\{recruiter_name\}/g, `${recruiter.first_name || ''} ${recruiter.last_name || ''}`.trim() || 'there');
  content = content.replace(/\{company_name\}/g, company.name || 'your company');
  content = content.replace(/\{position_title\}/g, positionTitle);
  content = content.replace(/\{recruiter_title\}/g, recruiter.title || 'Recruiter');
  
  return content;
}

function personalizeEmailSubject(
  subject: string,
  recruiter: any,
  company: any,
  positionTitle: string
): string {
  let personalizedSubject = subject;
  
  personalizedSubject = personalizedSubject.replace(/\{recruiter_first_name\}/g, recruiter.first_name || '');
  personalizedSubject = personalizedSubject.replace(/\{company_name\}/g, company.name || '');
  personalizedSubject = personalizedSubject.replace(/\{position_title\}/g, positionTitle);
  
  return personalizedSubject;
}

serve(handler);