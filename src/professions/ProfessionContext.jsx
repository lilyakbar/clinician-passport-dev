import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { getProfessionModule, availableProfessions, futureProfessions } from "@/professions/index";

const ProfessionContext = createContext(null);
const ACTIVE_KEY = "cp_active_profession";

export function ProfessionProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [activeKey, setActiveKey] = useState(() => localStorage.getItem(ACTIVE_KEY) || "dentistry");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const key = localStorage.getItem(ACTIVE_KEY) || "dentistry";
      let recs = await base44.entities.Profile.list("-created_date", 20);
      let p = (recs || []).find((r) => r.profession === key)
        || (recs || []).find((r) => r.profession === "dentistry")
        || (recs && recs[0]);
      if (!p) {
        const me = await base44.auth.me();
        p = await base44.entities.Profile.create({
          profession: key,
          full_name: me?.full_name || "",
          email: me?.email || "",
        });
      }
      setActiveKey(p.profession || key);
      setProfile(p);
    } catch (e) {
      setProfile(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateProfile = async (data) => {
    let p = profile;
    if (p) {
      p = await base44.entities.Profile.update(p.id, data);
    } else {
      // In-memory profile missing — check DB before creating a duplicate
      let existing = [];
      try { existing = await base44.entities.Profile.list("-created_date", 20); } catch (_) { existing = []; }
      const key = localStorage.getItem(ACTIVE_KEY) || "dentistry";
      const found = (existing || []).find((r) => r.profession === key) || (existing || [])[0];
      if (found) {
        p = await base44.entities.Profile.update(found.id, data);
      } else {
        p = await base44.entities.Profile.create({ profession: key, ...data });
      }
    }
    setProfile(p);
    return p;
  };

  // Switch the active profession. Persists locally and reloads the matching Profile.
  const setProfession = async (key) => {
    localStorage.setItem(ACTIVE_KEY, key);
    setActiveKey(key);
    await load();
  };

  const professionModule = getProfessionModule(activeKey);

  return (
    <ProfessionContext.Provider
      value={{
        profile, professionModule, loading, updateProfile, reload: load,
        professionKey: activeKey, setProfession,
        professions: availableProfessions, futureProfessions,
      }}
    >
      {children}
    </ProfessionContext.Provider>
  );
}

export function useProfession() {
  return useContext(ProfessionContext);
}