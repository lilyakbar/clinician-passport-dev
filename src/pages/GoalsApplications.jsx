import React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Goals from "@/pages/Goals";
import Applications from "@/pages/Applications";

export default function GoalsApplications() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[30px] sm:text-[34px] font-heading font-semibold tracking-tight text-foreground">
          Goals &amp; Applications
        </h1>
        <p className="text-[14px] text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">
          Plan your career goals and track the applications you're pursuing.
        </p>
      </div>

      <Tabs defaultValue="goals" className="w-full">
        <TabsList className="h-auto">
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="applications">Applications</TabsTrigger>
        </TabsList>
        <TabsContent value="goals">
          <Goals />
        </TabsContent>
        <TabsContent value="applications">
          <Applications />
        </TabsContent>
      </Tabs>
    </div>
  );
}