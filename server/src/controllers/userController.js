export function getProfile(req, res) {
  res.json({ user: req.user.toPublicUser() });
}

// Email is deliberately not editable here; changing the login identifier should
// require re-authentication rather than ride along on a profile update.
export async function updateProfile(req, res) {
  const { name, phone } = req.body;

  if (name !== undefined) req.user.name = name;
  if (phone !== undefined) req.user.phone = phone;

  await req.user.save();
  res.json({ user: req.user.toPublicUser() });
}
