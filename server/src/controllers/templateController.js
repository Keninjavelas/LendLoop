import Category from '../models/Category.js';
import ReminderTemplate, { TEMPLATE_SCOPES } from '../models/ReminderTemplate.js';
import { ApiError } from '../middleware/errorMiddleware.js';
import { PRIORITIES } from '../utils/constants.js';
import { TEMPLATE_PLACEHOLDERS } from '../utils/renderTemplate.js';
import { visibleTo } from './categoryController.js';

const EDITABLE_FIELDS = ['name', 'scope', 'priority', 'categoryId', 'subject', 'body'];

async function assertScopeTargets(payload, userId) {
  if (payload.scope === 'priority') {
    if (!PRIORITIES.includes(payload.priority)) {
      throw new ApiError(400, `A priority template needs a priority of: ${PRIORITIES.join(', ')}`);
    }
    payload.categoryId = null;
  } else if (payload.scope === 'category') {
    if (!payload.categoryId) throw new ApiError(400, 'A category template needs a category');
    const category = await Category.findOne({ _id: payload.categoryId, ...visibleTo(userId) });
    if (!category) throw new ApiError(404, 'Category not found');
    payload.priority = null;
  } else {
    payload.priority = null;
    payload.categoryId = null;
  }

  return payload;
}

export async function listTemplates(req, res) {
  const filter = visibleTo(req.user._id);
  if (req.query.scope && TEMPLATE_SCOPES.includes(req.query.scope)) filter.scope = req.query.scope;
  if (req.query.priority && PRIORITIES.includes(req.query.priority)) filter.priority = req.query.priority;

  const templates = await ReminderTemplate.find(filter)
    .sort({ isSystem: -1, scope: 1, name: 1 })
    .populate('categoryId', 'name defaultPriority');

  res.json({ templates, placeholders: TEMPLATE_PLACEHOLDERS });
}

export async function createTemplate(req, res) {
  const body = Object.fromEntries(
    Object.entries(req.body).filter(([key]) => EDITABLE_FIELDS.includes(key)),
  );

  if (!body.name || !String(body.name).trim()) throw new ApiError(400, 'Template name is required');
  if (!body.subject || !String(body.subject).trim()) throw new ApiError(400, 'Template subject is required');
  if (!body.body || !String(body.body).trim()) throw new ApiError(400, 'Template body is required');
  if (body.scope && !TEMPLATE_SCOPES.includes(body.scope)) {
    throw new ApiError(400, `Scope must be one of: ${TEMPLATE_SCOPES.join(', ')}`);
  }

  const payload = await assertScopeTargets(
    { scope: body.scope ?? 'general', priority: body.priority ?? null, categoryId: body.categoryId ?? null },
    req.user._id,
  );

  const template = await ReminderTemplate.create({
    name: String(body.name).trim(),
    subject: String(body.subject).trim(),
    body: String(body.body).trim(),
    scope: payload.scope,
    priority: payload.priority,
    categoryId: payload.categoryId,
    ownerId: req.user._id,
    isSystem: false,
  });

  res.status(201).json({ template: await template.populate('categoryId', 'name defaultPriority') });
}

export async function updateTemplate(req, res) {
  const template = await ReminderTemplate.findOne({ _id: req.params.id, ...visibleTo(req.user._id) });
  if (!template) throw new ApiError(404, 'Template not found');
  if (template.isSystem || !template.ownerId || !template.ownerId.equals(req.user._id)) {
    throw new ApiError(403, 'Built-in templates cannot be edited — create your own instead');
  }

  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([key]) => EDITABLE_FIELDS.includes(key)),
  );

  if (updates.name !== undefined) template.name = String(updates.name).trim();
  if (updates.subject !== undefined) template.subject = String(updates.subject).trim();
  if (updates.body !== undefined) template.body = String(updates.body).trim();

  if (updates.scope !== undefined || updates.priority !== undefined || updates.categoryId !== undefined) {
    const payload = await assertScopeTargets(
      {
        scope: updates.scope ?? template.scope,
        priority: updates.priority !== undefined ? updates.priority : template.priority,
        categoryId: updates.categoryId !== undefined ? updates.categoryId : template.categoryId,
      },
      req.user._id,
    );
    template.scope = payload.scope;
    template.priority = payload.priority;
    template.categoryId = payload.categoryId;
  }

  await template.save();

  res.json({ template: await template.populate('categoryId', 'name defaultPriority') });
}

export async function deleteTemplate(req, res) {
  const template = await ReminderTemplate.findById(req.params.id);
  if (!template) throw new ApiError(404, 'Template not found');
  if (template.isSystem || !template.ownerId || !template.ownerId.equals(req.user._id)) {
    throw new ApiError(403, 'Built-in templates cannot be deleted');
  }

  // Reminder logs keep a snapshot of the template name, so history survives this.
  await template.deleteOne();

  res.json({ deleted: true, templateId: template._id });
}
