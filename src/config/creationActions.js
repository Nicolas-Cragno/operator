import { catalog } from './catalog';
import { operationPolicy } from './operations';

// Project the same entries/actions used by CatalogTable; never register forms here.
export function creationActions(modules = [], user, capabilities) {
  return modules.map(module => {
    const actions = (catalog[module.id] || []).flatMap(entry => {
      if (!module.children?.some(child => child.id === entry.id)) return [];
      const policy = operationPolicy(module.id, entry, user, capabilities);
      if (!policy?.create || policy.createBlockedReason) return [];
      return entry.createActions.map((action, index) => ({
        key: `${module.id}:${entry.id}:${index}`,
        label: entry.createActions.length === 1 ? entry.label : `${entry.label} · ${action.label}`,
        entry, policy, initialValues: action.initialValues,
      }));
    });
    return { id: module.id, label: module.label, actions };
  }).filter(group => group.actions.length);
}
