//
//  Dock.h
//  MG
//
//  Created by Tim Debo on 5/22/14.
//
//
#import <Foundation/Foundation.h>
#import "Command.h"


@protocol DockExports <JSExport>

@property (readonly) NSString* badge;
- (void) addBadge: (NSString*) badge;
- (void) removeBadge;
@end

@interface Dock : Command <DockExports>


@end
