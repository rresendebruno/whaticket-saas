const rules = {
	user: {
		static: [],
	},

	supervisor: {
		static: [
			"drawer-supervisor-items:view",
			"tickets-manager:showall",
			"ticket-options:transferWhatsapp",
		],
	},

	admin: {
		static: [
			"drawer-admin-items:view",
			"tickets-manager:showall",
			"user-modal:editProfile",
			"user-modal:editQueues",
			"ticket-options:deleteTicket",
			"ticket-options:transferWhatsapp",
			"contacts-page:deleteContact",
		],
	},
};

export default rules;
