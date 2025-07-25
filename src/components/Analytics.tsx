import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { 
  BarChart3, 
  TrendingUp, 
  Mail, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Target,
  Users,
  Building2
} from "lucide-react";

interface AnalyticsData {
  totalCampaigns: number;
  totalEmails: number;
  emailsSent: number;
  emailsDelivered: number;
  deliveryRate: number;
  recentCampaigns: any[];
  companiesTargeted: number;
  recruitersFound: number;
}

const Analytics = () => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      // Fetch campaign data
      const { data: campaigns, error: campaignsError } = await supabase
        .from('email_campaigns')
        .select(`
          *,
          companies (
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (campaignsError) throw campaignsError;

      // Fetch companies count
      const { count: companiesCount, error: companiesError } = await supabase
        .from('companies')
        .select('*', { count: 'exact', head: true });

      if (companiesError) throw companiesError;

      // Fetch recruiters count
      const { count: recruitersCount, error: recruitersError } = await supabase
        .from('recruiters')
        .select('*', { count: 'exact', head: true });

      if (recruitersError) throw recruitersError;

      // Calculate analytics
      const totalCampaigns = campaigns?.length || 0;
      const totalEmails = campaigns?.reduce((sum, c) => sum + (c.total_emails || 0), 0) || 0;
      const emailsSent = campaigns?.reduce((sum, c) => sum + (c.emails_sent || 0), 0) || 0;
      const emailsDelivered = campaigns?.reduce((sum, c) => sum + (c.emails_delivered || 0), 0) || 0;
      const deliveryRate = emailsSent > 0 ? (emailsDelivered / emailsSent) * 100 : 0;

      setAnalytics({
        totalCampaigns,
        totalEmails,
        emailsSent,
        emailsDelivered,
        deliveryRate,
        recentCampaigns: campaigns?.slice(0, 5) || [],
        companiesTargeted: companiesCount || 0,
        recruitersFound: recruitersCount || 0,
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-pulse space-y-4 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted rounded-lg"></div>
            ))}
          </div>
          <div className="h-64 bg-muted rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-8">
        <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h3 className="text-lg font-medium mb-2">No Analytics Data</h3>
        <p className="text-muted-foreground">
          Create some campaigns to see your analytics dashboard.
        </p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-muted text-muted-foreground border-border';
      case 'sending': return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800';
      case 'completed': return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800';
      case 'failed': return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Mail className="h-4 w-4 text-primary" />
              <span className="ml-2 text-sm font-medium">Total Campaigns</span>
            </div>
            <div className="text-2xl font-bold">{analytics.totalCampaigns}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Building2 className="h-4 w-4 text-primary" />
              <span className="ml-2 text-sm font-medium">Companies Targeted</span>
            </div>
            <div className="text-2xl font-bold">{analytics.companiesTargeted}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Users className="h-4 w-4 text-primary" />
              <span className="ml-2 text-sm font-medium">Recruiters Found</span>
            </div>
            <div className="text-2xl font-bold">{analytics.recruitersFound}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="ml-2 text-sm font-medium">Delivery Rate</span>
            </div>
            <div className="text-2xl font-bold">{analytics.deliveryRate.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Email Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Email Performance
          </CardTitle>
          <CardDescription>
            Overview of your email outreach performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Mail className="h-8 w-8 text-blue-500" />
              </div>
              <div className="text-2xl font-bold">{analytics.totalEmails}</div>
              <div className="text-sm text-muted-foreground">Total Emails Queued</div>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <div className="text-2xl font-bold">{analytics.emailsSent}</div>
              <div className="text-sm text-muted-foreground">Emails Sent</div>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <TrendingUp className="h-8 w-8 text-purple-500" />
              </div>
              <div className="text-2xl font-bold">{analytics.emailsDelivered}</div>
              <div className="text-sm text-muted-foreground">Emails Delivered</div>
            </div>
          </div>

          {/* Progress bar for delivery rate */}
          <div className="mt-6">
            <div className="flex justify-between text-sm mb-2">
              <span>Delivery Rate</span>
              <span>{analytics.deliveryRate.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-gradient-primary h-2 rounded-full transition-smooth"
                style={{ width: `${Math.min(analytics.deliveryRate, 100)}%` }}
              ></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Campaigns */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Recent Campaigns
          </CardTitle>
          <CardDescription>
            Your latest email campaigns and their performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analytics.recentCampaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No campaigns yet. Create your first campaign to get started!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {analytics.recentCampaigns.map((campaign) => (
                <div key={campaign.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">
                        {campaign.position_title} at {campaign.companies?.name}
                      </h4>
                      <Badge 
                        variant="outline" 
                        className={getStatusColor(campaign.status)}
                      >
                        {campaign.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Created {new Date(campaign.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-center">
                      <div className="font-medium">{campaign.total_emails || 0}</div>
                      <div className="text-muted-foreground">Queued</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium">{campaign.emails_sent || 0}</div>
                      <div className="text-muted-foreground">Sent</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium">{campaign.emails_delivered || 0}</div>
                      <div className="text-muted-foreground">Delivered</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Analytics;