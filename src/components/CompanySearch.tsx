import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Search, Building2, Users, Mail, MapPin, Briefcase, Loader2 } from "lucide-react";

interface Company {
  id: string;
  name: string;
  domain: string;
  industry: string;
  size: string;
  location: string;
}

interface Recruiter {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  title: string;
  department: string;
  email_status: string;
}

interface SearchResult {
  company: Company;
  recruiters: Recruiter[];
  totalFound: number;
  message?: string;
}

const CompanySearch = () => {
  const [companyName, setCompanyName] = useState("");
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!companyName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a company name",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-apollo', {
        body: {
          companyName: companyName.trim(),
          domain: domain.trim() || undefined,
        },
      });

      if (error) {
        throw error;
      }

      setSearchResult(data);
      
      if (data.message) {
        // Handle plan limitation message
        toast({
          title: "Company Found",
          description: data.message,
          variant: "default",
        });
      } else {
        toast({
          title: "Search Complete",
          description: `Found ${data.recruiters.length} recruiters at ${data.company.name}`,
        });
      }
    } catch (error: any) {
      console.error('Search error:', error);
      toast({
        title: "Search Failed",
        description: error.message || "Failed to search for company",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'valid': return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800';
      case 'risky': return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800';
      case 'invalid': return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="company-name">Company Name *</Label>
          <Input
            id="company-name"
            placeholder="e.g., Tesla, Microsoft, Stripe"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="domain">Domain (optional)</Label>
          <Input
            id="domain"
            placeholder="e.g., tesla.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
      </div>

      <Button 
        onClick={handleSearch} 
        disabled={loading || !companyName.trim()}
        className="w-full md:w-auto"
        size="lg"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Searching Apollo.io...
          </>
        ) : (
          <>
            <Search className="mr-2 h-4 w-4" />
            Find Recruiters
          </>
        )}
      </Button>

      {/* Search Results */}
      {searchResult && (
        <div className="space-y-6">
          <Separator />
          
          {/* Company Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                {searchResult.company.name}
              </CardTitle>
              <CardDescription className="flex items-center gap-4 text-sm">
                {searchResult.company.domain && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {searchResult.company.domain}
                  </span>
                )}
                {searchResult.company.industry && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3" />
                    {searchResult.company.industry}
                  </span>
                )}
                {searchResult.company.size && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {searchResult.company.size}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Recruiters */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Recruiters Found ({searchResult.recruiters.length})
              </h3>
              {searchResult.totalFound > searchResult.recruiters.length && (
                <Badge variant="outline">
                  {searchResult.totalFound} total contacts found
                </Badge>
              )}
            </div>

            {searchResult.recruiters.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  {searchResult.message ? (
                    <div className="space-y-3">
                      <p className="text-orange-600 font-medium">Apollo.io Plan Limitation</p>
                      <p className="text-muted-foreground">{searchResult.message}</p>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => window.open('https://app.apollo.io/', '_blank')}
                      >
                        Upgrade Apollo.io Plan
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-muted-foreground">No recruiters with valid emails found for this company.</p>
                      <p className="text-sm mt-2 text-muted-foreground">Try searching for a different company or check the domain.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {searchResult.recruiters.map((recruiter) => (
                  <Card key={recruiter.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">
                              {recruiter.first_name} {recruiter.last_name}
                            </h4>
                            <Badge 
                              variant="outline" 
                              className={getStatusColor(recruiter.email_status)}
                            >
                              {recruiter.email_status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {recruiter.title}
                          </p>
                          {recruiter.department && (
                            <p className="text-xs text-muted-foreground">
                              {recruiter.department}
                            </p>
                          )}
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3" />
                            {recruiter.email}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanySearch;