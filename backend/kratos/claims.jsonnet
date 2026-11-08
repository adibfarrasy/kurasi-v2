local claims = std.extVar('claims');
local session = std.extVar('session');
local traits = session.identity.traits;
// name and picture are optional traits; direct access throws when absent.
local opt(field) = if std.objectHas(traits, field) then traits[field] else null;
{
  claims: claims {
    email: traits.email,
    name: opt('name'),
    picture: opt('picture'),
  },
}