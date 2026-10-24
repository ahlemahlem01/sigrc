import { useReferenceLists } from '../hooks/useReferenceLists';

/** Loads the reference lists once the user is signed in, so that defect types are shown with their wording everywhere. */
export default function ReferenceLabelsLoader() {
  useReferenceLists();
  return null;
}
