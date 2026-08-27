import React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Credentials from "@/pages/Credentials";
import ContinuingEducation from "@/pages/ContinuingEducation";
import ComplianceIntelligence from "@/pages/ComplianceIntelligence";

export default function CredentialsCE() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[30px] sm:text-[34px] font-heading font-semibold tracking-tight text-foreground">
          Credentials &amp; CE
        </h1>
        <p className="text-[14px] text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">
          Track licenses and credentials, continuing education, and compliance requirements in one place.
        </p>
      </div>

      <Tabs defaultValue="credentials" className="w-full">
        <TabsList className="h-auto">
          <TabsTrigger value="credentials">Licenses &amp; Credentials</TabsTrigger>
          <TabsTrigger value="ce">CE / CME</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
        </TabsList>
        <TabsContent value="credentials">
          <Credentials />
        </TabsContent>
        <TabsContent value="ce">
          <ContinuingEducation />
        </TabsContent>
        <TabsContent value="compliance">
          <ComplianceIntelligence />
        </TabsContent>
      </Tabs>
    </div>
  );
}