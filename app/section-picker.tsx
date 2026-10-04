import { workerSections, type WorkerSection } from '@/lib/access';

export default function SectionPicker({ value, onChange, name = 'worker-section' }: { value: WorkerSection | null; onChange: (section: WorkerSection) => void; name?: string }) {
  return <fieldset className="section-choice"><legend>Your work section</legend><div className="section-options">{workerSections.map(section => <label key={section}><input type="radio" name={name} value={section} checked={value === section} onChange={() => onChange(section)}/><span>{section}</span></label>)}</div></fieldset>;
}
