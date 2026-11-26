# Governed page archetypes

All 12 archetypes have a representative Storybook reference in the registry's `layoutReferences`. These references are design starting points, not proof of route adoption.

| Archetype | Existing or extended composition |
| --- | --- |
| Dashboard | DashboardLayout, DashboardPanel, StatCard |
| Directory | DirectoryPage, DirectoryTable, FilterBar |
| Record | RecordLayout, RecordHeader, RecordFacts |
| Guided setup | GuidedSetupShell, WorkflowProgress, ActionFooter |
| Builder | StudioLayout, Field, ActionStateIndicator |
| Review | SplitReviewShell, MasterDetailWorkspace, StatusTimeline |
| Learning | ClassroomWorkspace and authorized lesson presentation |
| Reporting | ReportChart, ReportMetricCard, reporting filters |
| Public | BrandTheme, WorkspaceShell, form primitives; actual public HTML has separate review requirements |
| Calendar | CalendarAgendaList, CalendarMonthGrid, CalendarWeekGrid, LocalDateTimeField |
| Communication | MessagesWorkspace, NotificationFeed, GoLinkActions |
| Settings | WorkspaceShell, WorkspacePanel, RecordFacts, notices |

For each page, review actual route behavior, authorize all inputs at the source, preserve navigation context, verify keyboard/viewport behavior and record evidence. The layout reference itself never verifies a page.
