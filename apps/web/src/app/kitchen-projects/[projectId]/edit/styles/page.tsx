import { EditPageShell } from '../../../../../components/edit/EditPageShell';
import { MoodboardScreen } from '../../../../../components/moodboard/MoodboardScreen';

// Identical HTML for every visitor: the project loads on the client through the /api proxy.
export const dynamic = 'force-dynamic';

/** Edit styles of a claimed project (design: docs/design/simulations-ux-overhaul.md, edit pages). Owner only. */
export default function EditStylesPage({ params }: { params: Promise<{ projectId: string }> }) {
  return <EditPageShell params={params}>{(projectId) => <MoodboardScreen edit={{ projectId }} />}</EditPageShell>;
}
