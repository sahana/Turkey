# -*- coding: utf-8 -*-

from gluon import *
from s3 import *
from s3layouts import *
try:
    from .layouts import *
except ImportError:
    pass
import s3menus as default

# =============================================================================
class S3MainMenu(default.S3MainMenu):
    """ Custom Application Main Menu """

    
    
    # -------------------------------------------------------------------------
    @classmethod
    def menu_modules(cls):
        """ Custom Modules Menu """
        auth = current.auth
        has_role = auth.s3_has_role
        
        if has_role("ADMIN"):
            main_menu = [
                homepage(),
                MM("Case/PSS Management", c=("dvr", "pr")),
                #homepage("gis"),
                homepage("org"),                
                #homepage("cr"),
            ]
        elif has_role("PSS_ADMIN"):
            main_menu = [
                homepage(),
                MM("PSS Management", c=("dvr", "pr")),             
            ]
        elif has_role("ORG_ADMIN"):
            main_menu = [
                homepage(),
                MM("Case Management", c=("dvr", "pr")),
                #homepage("gis"),
                homepage("org"),                
                #homepage("cr"),
            ]
        else:
            main_menu = [
                homepage(),             
            ]
            
        #sysname = current.deployment_settings.get_system_name_short()
        return main_menu
    # -------------------------------------------------------------------------
    @classmethod
    def menu_help(cls, **attr):
        """ Help Menu """

        menu_help = MM("Help", c="default", f="help", **attr)(
            MM("Contact us", f="contact"),
            MM("About Us", f="about"),
        )
        return menu_help

# =============================================================================
class S3OptionsMenu(default.S3OptionsMenu):
    """ Custom Application Side Menu """

    # -------------------------------------------------------------------------
    @staticmethod
    def dvr():
        """ DVR / Disaster Victim Registry """
        
        auth = current.auth
        has_role = auth.s3_has_role
        
        if has_role("ADMIN"):
            return M(c="dvr")(
                    M("All Records", c=("dvr", "pr"), f="person")(
                        M("Create", m="create"),
                    ),
                    M("Case Types", f="case_type")(
                        M("Create", m="create"),
                    ),
                    M("Case Activity Types", f="case_activity_type")(
                        M("Create", m="create"),
                    ),
                    M("Need Types", f="need")(
                       M("Create", m="create"),
                    ),
                    M("Housing Types", f="housing_type")(
                       M("Create", m="create"),
                    ),
                    M("Income Sources", f="income_source")(
                      M("Create", m="create"),
                    ),
                    M("Beneficiary Types", f="beneficiary_type")(
                       M("Create", m="create"),
                    ),
                    M("Training Course Catalog", f="course",)(
                        M("Create", m="create"),
                    ),
                    M("Training Events", f="training_event")(
                        M("Create", m="create"),
                        M("Search Training Participants", f="training"),
                    ),
                )
        elif has_role("PSS_ADMIN"):
            return M(c="dvr")(
                    M("All Records", c=("dvr", "pr"), f="person")(
                        M("Create", m="create"),
                    ),
                    M("Training Course Catalog", f="course",)(
                        M("Create", m="create"),
                    ),
                    M("Training Events", f="training_event")(
                        M("Create", m="create"),
                        M("Search Training Participants", f="training"),
                    ),
                )
        elif has_role("ORG_ADMIN"):
            return M(c="dvr")(
                    M("All Records", c=("dvr", "pr"), f="person")(
                        M("Create", m="create"),
                    ),                    
                    M("Case Activity Types", f="case_activity_type")(
                        M("Create", m="create"),
                    ),
                    M("Need Types", f="need")(
                       M("Create", m="create"),
                    ),
                    M("Housing Types", f="housing_type")(
                       M("Create", m="create"),
                    ),
                    M("Income Sources", f="income_source")(
                      M("Create", m="create"),
                    ),
                    M("Beneficiary Types", f="beneficiary_type")(
                       M("Create", m="create"),
                    ),
                    M("Training Course Catalog", f="course",)(
                        M("Create", m="create"),
                    ),
                    M("Training Events", f="training_event")(
                        M("Create", m="create"),
                        M("Search Training Participants", f="training"),
                    ),
                )

# END =========================================================================
