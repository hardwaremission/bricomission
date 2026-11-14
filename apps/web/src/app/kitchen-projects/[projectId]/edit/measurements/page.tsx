import { EditPageShell } from '../../../../../components/edit/EditPageShell';
import { CaptureScreen } from '../../../../../components/capture/CaptureScreen';

// Identical HTML for every visitor: the project loads on the client through the /api proxy.
export const dynamic = 'force-dynamic';

/** Edit measurements of a claimed project (design: docs/design/simulations-ux-overhaul.md, edit pages). Owner only. */
export default function EditMeasurementsPage({ params }: { params: Promise<{ projectId: string }> }) {
  return <EditPageShell params={params}>{(projectId) => <CaptureScreen edit={{ projectId, section: 'measurements' }} />}</EditPageShell>;
}
