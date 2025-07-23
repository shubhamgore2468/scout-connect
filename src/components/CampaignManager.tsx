import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Send, Eye, Trash2, Building2, Users, Loader2, Mail } from "lucide-react";

interface Company {
  id: string;
  name: string;
  domain: string;
}

interface Campaign {
  id: string;
  position_title: string;
  email_subject: string;
  email_template: string;
  total_emails: number;
  emails_sent: number;
  emails_delivered: number;
  status: string;
  created_at: string;
  companies: Company;
}

const CampaignManager = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [positionTitle, setPositionTitle] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailTemplate, setEmailTemplate] = useState("");
  const { toast } = useToast();

  const defaultEmailTemplate = `Hi {recruiter_first_name},

I hope this email finds you well. I came across {company_name} and was impressed by your work in the industry.

I'm actively seeking opportunities as a {position_title} and would love to learn more about potential openings at {company_name}. With my background in [YOUR SKILLS], I believe I could contribute significantly to your team.

Would you be open to a brief conversation about current or upcoming opportunities?

Thank you for your time, and I look forward to hearing from you.

Best regards,
[YOUR NAME]
[YOUR CONTACT INFO]`;

  useEffect(() => {
    fetchCompanies();
    fetchCampaigns();
  }, []);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, domain')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from('email_campaigns')
        .select(`
          *,
          companies (
            id,
            name,
            domain
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    }
  };

  const createCampaign = async () => {
    if (!selectedCompany || !positionTitle || !emailSubject || !emailTemplate) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_campaigns')
        .insert({
          company_id: selectedCompany,
          position_title: positionTitle,
          email_subject: emailSubject,
          email_template: emailTemplate,
        })
        .select(`
          *,
          companies (
            id,
            name,
            domain
          )
        `)
        .single();

      if (error) throw error;

      setCampaigns([data, ...campaigns]);
      setShowCreateForm(false);
      resetForm();
      
      toast({
        title: "Campaign Created",
        description: "Your email campaign has been created successfully",
      });
    } catch (error: any) {
      console.error('Error creating campaign:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create campaign",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const sendCampaign = async (campaignId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-campaign', {
        body: {
          campaignId,
          fromEmail: "outreach@resend.dev", // You can make this configurable
          fromName: "Job Seeker", // You can make this configurable
        },
      });

      if (error) throw error;

      toast({
        title: "Campaign Sent",
        description: `Campaign sent successfully! ${data.emailsSent} emails delivered.`,
      });

      // Refresh campaigns to update status
      fetchCampaigns();
    } catch (error: any) {
      console.error('Error sending campaign:', error);
      toast({
        title: "Send Failed",
        description: error.message || "Failed to send campaign",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteCampaign = async (campaignId: string) => {
    try {
      const { error } = await supabase
        .from('email_campaigns')
        .delete()
        .eq('id', campaignId);

      if (error) throw error;

      setCampaigns(campaigns.filter(c => c.id !== campaignId));
      toast({
        title: "Campaign Deleted",
        description: "Campaign has been deleted successfully",
      });
    } catch (error: any) {
      console.error('Error deleting campaign:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete campaign",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setSelectedCompany("");
    setPositionTitle("");
    setEmailSubject("");
    setEmailTemplate(defaultEmailTemplate);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'sending': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (companies.length === 0) {
    return (
      <div className="text-center py-8">
        <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h3 className="text-lg font-medium mb-2">No Companies Found</h3>
        <p className="text-muted-foreground mb-4">
          You need to search for companies first before creating campaigns.
        </p>
        <Button variant="outline">
          <Building2 className="mr-2 h-4 w-4" />
          Go to Company Search
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Create Campaign Button */}
      {!showCreateForm && (
        <Button onClick={() => setShowCreateForm(true)} className="w-full md:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Create New Campaign
        </Button>
      )}

      {/* Create Campaign Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create Email Campaign</CardTitle>
            <CardDescription>
              Set up a personalized cold email campaign for your job search
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company">Target Company *</Label>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="position">Position Title *</Label>
                <Input
                  id="position"
                  placeholder="e.g., Senior Software Engineer"
                  value={positionTitle}
                  onChange={(e) => setPositionTitle(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Email Subject *</Label>
              <Input
                id="subject"
                placeholder="e.g., Interested in {position_title} opportunities at {company_name}"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template">Email Template *</Label>
              <Textarea
                id="template"
                placeholder="Your email template..."
                value={emailTemplate}
                onChange={(e) => setEmailTemplate(e.target.value)}
                rows={10}
              />
              <p className="text-xs text-muted-foreground">
                Use variables: {"{recruiter_first_name}"}, {"{company_name}"}, {"{position_title}"}, {"{recruiter_title}"}
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={createCampaign} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Campaign"
                )}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowCreateForm(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Campaigns List */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          Your Campaigns ({campaigns.length})
        </h3>

        {campaigns.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No campaigns created yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {campaigns.map((campaign) => (
              <Card key={campaign.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {campaign.position_title} at {campaign.companies.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Subject: {campaign.email_subject}
                      </CardDescription>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={getStatusColor(campaign.status)}
                    >
                      {campaign.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total Emails</p>
                      <p className="font-medium">{campaign.total_emails}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Sent</p>
                      <p className="font-medium">{campaign.emails_sent}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Delivered</p>
                      <p className="font-medium">{campaign.emails_delivered}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Created</p>
                      <p className="font-medium">
                        {new Date(campaign.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {campaign.status === 'draft' && (
                      <Button 
                        onClick={() => sendCampaign(campaign.id)}
                        disabled={loading}
                        size="sm"
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Send Campaign
                      </Button>
                    )}
                    <Button variant="outline" size="sm">
                      <Eye className="mr-2 h-4 w-4" />
                      View Details
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => deleteCampaign(campaign.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CampaignManager;