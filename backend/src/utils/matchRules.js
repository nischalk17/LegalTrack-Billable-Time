function matchRules(activity, rules) {
  for (const rule of rules) {
    let field = null;
    switch (rule.rule_type) {
      case 'domain':
        field = activity.domain;
        break;
      case 'app_name':
        field = activity.app_name;
        break;
      case 'window_title':
        field = activity.window_title;
        break;
      case 'file_extension':
        field = activity.file_name;
        break;
    }

    if (!field) continue;

    field = field.toLowerCase();
    const pattern = rule.pattern.toLowerCase();

    if (rule.rule_type === 'file_extension') {
      if (field.endsWith(pattern)) return rule;
      continue;
    }

    switch (rule.match_type) {
      case 'contains':
        if (field.includes(pattern)) return rule;
        break;
      case 'exact':
        if (field === pattern) return rule;
        break;
      case 'starts_with':
        if (field.startsWith(pattern)) return rule;
        break;
    }
  }
  return null;
}

module.exports = { matchRules };
