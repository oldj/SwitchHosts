//
//  Notify.m
//  MG
//
//  Created by Tim Debo on 5/27/14.
//
//

#import "Notify.h"
@interface Notify ()
@property (readwrite) NSMutableArray* notifications;
@end

@implementation Notify

- (void) notify:(NSDictionary*)aNotification {
    NSString* type = [aNotification valueForKey:@"type"];
    NSString* uid = [aNotification valueForKey:@"id"];
    
    if([type isEqualToString:@"sheet"]) {
        NSAlert *alert = [[NSAlert alloc] init];
        [alert setMessageText:[aNotification valueForKey:@"title"]];
        [alert setInformativeText:[aNotification valueForKey:@"content"]];
        [alert beginSheetModalForWindow:[[NSApplication sharedApplication] mainWindow]
                          modalDelegate:self
                         didEndSelector:nil
                            contextInfo:nil];
        
        
    } else {
        
        NSUserNotification *notification = [[NSUserNotification alloc] init];
        
        if(!uid) {
           uid =[[NSUUID UUID] UUIDString];
           
        }
        
        [notification setTitle:[aNotification valueForKey:@"title"]];
        [notification setInformativeText:[aNotification valueForKey:@"content"]];
        [notification setSubtitle:[aNotification valueForKey:@"subtitle"]];
        [notification setUserInfo:@{ @"id" : uid }];
        
        if([[aNotification valueForKey:@"sound"] boolValue] == YES || ![aNotification valueForKey:@"sound"] ) {
            [notification setSoundName: NSUserNotificationDefaultSoundName];
        }
        [[NSUserNotificationCenter defaultUserNotificationCenter] deliverNotification:notification];
       
        [self.notifications addObject:@{ @"id" : uid, @"title" : [aNotification valueForKey: @"title"], @"sentOn" :[NSDate date] }];

    }
    
    
    
}

- (void) close:(NSString*)notificationId {
    NSUserNotificationCenter *center = [NSUserNotificationCenter defaultUserNotificationCenter];
    for(NSUserNotification * deliveredNote in center.deliveredNotifications) {
        if ([notificationId isEqualToString:@"*"] || [deliveredNote.userInfo[@"id"] isEqualToString:notificationId]) {
            [center removeDeliveredNotification: deliveredNote];
        }
    }
}



+ (BOOL) available {
    if ([NSUserNotificationCenter respondsToSelector:@selector(defaultUserNotificationCenter)])
        return YES;
    
    return NO;
}

@end
