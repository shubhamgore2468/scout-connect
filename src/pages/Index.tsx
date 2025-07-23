import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import CompanySearch from "@/components/CompanySearch";
import CampaignManager from "@/components/CampaignManager";
import Analytics from "@/components/Analytics";
import { Search, Mail, BarChart3, Target } from "lucide-react";

const Index = () => {
  const [activeTab, setActiveTab] = useState("search");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-r from-primary to-purple-600 text-primary-foreground shadow-lg">
              <Target className="h-8 w-8" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              Scout Connect
            </h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Find recruiters and send personalized cold emails to land your dream job
          </p>
        </div>

        {/* Main Interface */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex justify-center mb-8">
            <TabsList className="grid w-full max-w-md grid-cols-3 bg-card shadow-lg">
              <TabsTrigger value="search" className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Search
              </TabsTrigger>
              <TabsTrigger value="campaigns" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Campaigns
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Analytics
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="max-w-6xl mx-auto">
            <TabsContent value="search" className="space-y-6">
              <Card className="shadow-elegant border-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5 text-primary" />
                    Company & Recruiter Search
                  </CardTitle>
                  <CardDescription>
                    Search for companies and discover their recruiters using Apollo.io
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CompanySearch />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="campaigns" className="space-y-6">
              <Card className="shadow-elegant border-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-primary" />
                    Email Campaigns
                  </CardTitle>
                  <CardDescription>
                    Create and manage your cold email outreach campaigns
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CampaignManager />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="analytics" className="space-y-6">
              <Card className="shadow-elegant border-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Campaign Analytics
                  </CardTitle>
                  <CardDescription>
                    Track your email performance and optimize your outreach
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Analytics />
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;