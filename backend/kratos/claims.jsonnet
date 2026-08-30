local claims = std.extVar('claims');
local session = std.extVar('session');
{
  claims: claims {
    email: session.identity.traits.email,
    name: session.identity.traits.name,
    picture: session.identity.traits.picture,
  },
}