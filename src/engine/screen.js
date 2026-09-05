// Eating-disorder screen (SCOFF, five yes/no items). Standard scoring: two or more "yes" answers is a positive screen.
// Wording below is a placeholder. Mary writes the final language (Phase 1, A9).
export const SCOFF_ITEMS = [
  { id: 'sick', text: 'Do you make yourself sick because you feel uncomfortably full?' },
  { id: 'control', text: 'Do you worry you have lost control over how much you eat?' },
  { id: 'one_stone', text: 'Have you recently lost more than 14 pounds in a three-month period?' },
  { id: 'fat', text: 'Do you believe yourself to be fat when others say you are too thin?' },
  { id: 'food', text: 'Would you say that food dominates your life?' }
];
export const SCOFF_POSITIVE_THRESHOLD = 2;

export function scoreScoff(answers) {
  const yes = (answers || []).filter(Boolean).length;
  return { yes, positive: yes >= SCOFF_POSITIVE_THRESHOLD };
}

export const SUPPORT_TEXT = {
  heading: 'Support',
  plain: 'Your answers suggest that a weight-focused or restrictive plan may not be the right thing for you right now. This app will keep your allergen and celiac rules on and turn the rest off. That is not a judgment. It is the same step a dietitian would take.',
  referral: [
    { name: 'National Alliance for Eating Disorders', detail: 'Helpline and treatment finder. allianceforeatingdisorders.com', verify: 'Confirm the current helpline number before sharing with family.' }
  ],
  do_not_list: ['NEDA helpline (discontinued; do not list)']
};
