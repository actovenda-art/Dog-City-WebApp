select public.finance_get_feature_flag('finance.reports_v2_enabled', '992c8aa3-8c11-44a6-87fc-0346725f4980') as reports_v2_enabled,
       public.finance_get_feature_flag('finance.cockpit_v2_enabled', '992c8aa3-8c11-44a6-87fc-0346725f4980') as cockpit_v2_enabled;
