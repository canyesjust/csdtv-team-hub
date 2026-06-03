-- Student intern onboarding checklist v2 (2026 default)
-- Replaces retired template rows and inserts the expanded checklist.

DO $$
BEGIN
  UPDATE onboarding_template_items SET active = false WHERE track_id = 'student_intern';
  UPDATE onboarding_phases SET active = false WHERE track_id = 'student_intern';
  UPDATE onboarding_categories SET active = false WHERE track_id = 'student_intern';

  INSERT INTO onboarding_tracks (id, name, team_role, active)
  VALUES ('student_intern', 'Student intern', 'Student Intern', true)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    team_role = EXCLUDED.team_role,
    active = true;

  CREATE TEMP TABLE _student_onboarding_phase (label text PRIMARY KEY, sort_order int);
  INSERT INTO _student_onboarding_phase (label, sort_order) VALUES
  ('Getting started', 0),
  ('Training', 1),
  ('Production', 2),
  ('Wrap-up', 3);

  INSERT INTO onboarding_phases (track_id, label, sort_order, active)
  SELECT 'student_intern', label, sort_order, true FROM _student_onboarding_phase;

  CREATE TEMP TABLE _student_onboarding_category (label text PRIMARY KEY, sort_order int);
  INSERT INTO _student_onboarding_category (label, sort_order) VALUES
  ('Getting Access', 0),
  ('HR & Admin', 1),
  ('Compliance & Policies', 2),
  ('Equipment', 3),
  ('Software & File Standards', 4),
  ('Brand & Style', 5),
  ('Communications', 6),
  ('Production', 7),
  ('Wrap-Up', 8);

  INSERT INTO onboarding_categories (track_id, label, sort_order, active)
  SELECT 'student_intern', label, sort_order, true FROM _student_onboarding_category;

  CREATE TEMP TABLE _student_onboarding_item (
    phase_label text,
    category_label text,
    title text,
    description text,
    sort_order int,
    required boolean
  );

  INSERT INTO _student_onboarding_item (phase_label, category_label, title, description, sort_order, required) VALUES
  ('Getting started', 'Getting Access', 'District Google Workspace email', 'Confirm your login, test access, and set it up on your device.', 0, true),
  ('Getting started', 'Getting Access', 'Send a test email', 'Send a quick email to Justin from your district account to confirm everything works.', 1, true),
  ('Getting started', 'Getting Access', 'Set up your email signature', 'Add your name, intern title, and CSDtv to your district email signature.', 2, true),
  ('Getting started', 'Getting Access', 'Productions web app', 'Get your login, walk through the interface, and understand where your tasks will live.', 3, true),
  ('Getting started', 'Getting Access', 'Productions portal', 'Navigate productions.canyonsdistrict.org and understand how projects are tracked and assigned.', 4, true),
  ('Getting started', 'Getting Access', 'Google Drive access', 'Confirm you can access the CSDtv shared Google Drive and understand the folder structure.', 5, true),
  ('Getting started', 'Getting Access', 'External hard drive setup', 'Format your drive correctly and build out your project folder structure using CSDtv file naming conventions before your first assignment.', 6, true),
  ('Getting started', 'Getting Access', 'Team Hub login', 'Sign in to csdtvstaff.org using your district email magic link.', 7, true),
  ('Getting started', 'Getting Access', 'Read one Team Hub article', 'Browse the Team Hub library and read any article of your choice to get familiar with the knowledge base.', 8, true),
  ('Getting started', 'Getting Access', 'Subscribe to the productions calendar', 'Add the CSDtv productions calendar to your Google Calendar so you know what''s coming up.', 9, true),
  ('Getting started', 'HR & Admin', 'District onboarding paperwork', 'Complete all required district intern documentation.', 10, true),
  ('Getting started', 'HR & Admin', 'Review intern schedule and hours', 'Confirm your working days, start and end times, and how to communicate if you''re running late or out.', 11, true),
  ('Getting started', 'HR & Admin', 'Supervision chain', 'Know who to go to when Justin isn''t available and how to reach them.', 12, true),
  ('Getting started', 'HR & Admin', 'Performance expectations', 'Review and align with Justin on what a successful internship looks like — quality of work, communication habits, reliability, and growth.', 13, true),
  ('Getting started', 'HR & Admin', 'Set up weekly hour logging', 'Confirm where and how to log your hours each week and submit your first entry.', 14, true),
  ('Getting started', 'HR & Admin', 'Schedule summer 1:1 with Justin', 'Book a recurring 1:1 with Justin for the duration of your internship. This is your standing time to ask questions, get feedback, and stay aligned.', 15, true),
  ('Getting started', 'Compliance & Policies', 'FERPA acknowledgment', 'Understand what it means to film minors in a school district. Know what you can and cannot share, post, or use for personal purposes. Sign the acknowledgment.', 16, true),
  ('Getting started', 'Compliance & Policies', 'Copyright and music licensing', 'Learn what CSDtv''s rules are around music and third-party content. You cannot use unlicensed music in any production.', 17, true),
  ('Getting started', 'Compliance & Policies', 'Accessibility and captions', 'Understand CSDtv''s captioning standards and where accessibility fits into the publishing workflow.', 18, true),
  ('Getting started', 'Compliance & Policies', 'Content approval chain', 'Learn who approves content at each stage of production. Nothing publishes without going through proper review.', 19, true),
  ('Getting started', 'Compliance & Policies', 'On-location protocols', 'School filming permissions, safety expectations on shoots, and what to do if access is denied or a situation escalates.', 20, true),
  ('Getting started', 'Compliance & Policies', 'Complete critical policies', 'Complete all required policy reading and acknowledgments assigned through the district.', 21, true),
  ('Training', 'Equipment', 'Equipment room orientation', 'Walk the equipment room with Justin. Learn what cameras, audio gear, and accessories CSDtv uses, where everything lives, and how it''s organized.', 22, true),
  ('Training', 'Equipment', 'Studio and broadcast equipment overview', 'Orientation to the live production setup — switcher, monitors, and studio gear.', 23, true),
  ('Training', 'Equipment', 'Independent equipment checkout', 'Check out and return gear on your own following proper protocol. No hand-holding — this is a competency check.', 24, true),
  ('Training', 'Software & File Standards', 'NLE setup', 'Confirm access to CSDtv''s editing software. Open it, confirm settings, and flag any issues to Justin.', 25, true),
  ('Training', 'Software & File Standards', 'File naming and folder conventions', 'Learn CSDtv''s file naming format and where project files get saved. Bad file hygiene breaks shared workflows.', 26, true),
  ('Training', 'Brand & Style', 'Watch recent CSDtv productions', 'Review a sample of recent work across different formats — news, event coverage, short-form. Notice pacing, tone, and quality standards.', 27, true),
  ('Training', 'Brand & Style', 'Brand standards review', 'Review CSDtv''s visual identity — logo usage, color palette, and fonts.', 28, true),
  ('Training', 'Brand & Style', 'Lower thirds and graphics package', 'Learn the templates used for on-screen text and titles. Know where the files live and how to use them correctly.', 29, true),
  ('Training', 'Brand & Style', 'Brand asset library', 'Confirm you know where to find approved logos, fonts, and graphics.', 30, true),
  ('Training', 'Brand & Style', 'Follow CSDtv online', 'Follow CSDtv on its social media channels and YouTube so you''re watching the work and staying current.', 31, true),
  ('Training', 'Communications', 'Add Justin and Ryan to your phone', 'Save both contacts and create a group chat with them. All team communication goes through the group — not individual texts.', 32, true),
  ('Training', 'Communications', 'Email communication norms', 'Learn how the team communicates — expected response times, how to flag problems, and the tone CSDtv uses in professional correspondence.', 33, true),
  ('Production', 'Production', 'Building and office tour', 'Walk through the office, studio, edit bays, and equipment storage with Justin.', 34, true),
  ('Production', 'Production', 'Meet key staff', 'Introductions to the people you''ll work with regularly — faces, names, and roles.', 35, true),
  ('Production', 'Production', 'CSDtv mission overview', 'Understand what CSDtv is, the scope of production, and what your role contributes.', 36, true),
  ('Production', 'Production', 'Review assigned productions', 'Open Productions and confirm which shows you are listed on.', 37, true),
  ('Production', 'Production', 'Shadow a full production', 'Follow one complete CSDtv project through every stage — briefing, shoot, edit, review, and delivery. Observe without taking over.', 38, true),
  ('Production', 'Production', 'On-location shoot', 'Participate in a real shoot outside the studio. Contribute where directed. Apply on-location protocols.', 39, true),
  ('Production', 'Production', 'First solo production task', 'Receive and complete a real assigned project — short-form video, b-roll shoot, or broadcast segment.', 40, true),
  ('Production', 'Production', 'Submit first content for review', 'Deliver your draft or rough cut through the proper submission channel. Do not self-publish.', 41, true),
  ('Production', 'Production', 'Attend a live studio session', 'Participate in a scheduled broadcast or studio recording in a real contributing role.', 42, true),
  ('Wrap-up', 'Wrap-Up', 'Intern-led check-in with Justin', 'You run this meeting. Walk Justin through what you worked on, what went well, what was hard, and what you want to focus on next. Use your performance expectations as your guide.', 43, true);

  INSERT INTO onboarding_template_items (
    track_id, phase_id, category_id, title, description, library_article_id, sort_order, required, active
  )
  SELECT
    'student_intern',
    p.id,
    c.id,
    v.title,
    v.description,
    NULL,
    v.sort_order,
    v.required,
    true
  FROM _student_onboarding_item v
  JOIN onboarding_phases p
    ON p.track_id = 'student_intern' AND p.label = v.phase_label AND p.active
  JOIN onboarding_categories c
    ON c.track_id = 'student_intern' AND c.label = v.category_label AND c.active;
END $$;
