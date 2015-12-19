//
//  File.m
//  MG
//
//  Created by Tim Debo on 6/8/14.
//
//

#import "File.h"
#import "WindowController.h"

@interface File ()

@property (nonatomic) NSArray* acceptedTypes;

@end

@implementation File

- (id) initWithWindowController:(WindowController *)aWindowController
{
    self = [super init];
    
    if(self) {
        self.windowController = aWindowController;
        self.webView = aWindowController.webView;
        _acceptedTypes = @[ @"string", @"json", @"image"];

    }
 
    return self;
}


- (void) writeFile:(NSString*)filePath withData: (JSValue*) data andType: (NSString*) type
{
    
    if([_acceptedTypes containsObject:type]){
        
        if([type isEqualToString:@"string"]) {
            NSString* valToWrite = [data toString];
            [valToWrite writeToFile:filePath atomically:YES encoding:NSUTF8StringEncoding error:NULL];
        } else if([type isEqualToString:@"json"]) {
            
            NSDictionary* dictData = [data toDictionary];
            NSString* valToWrite = [dictData JSONString];
            
            [valToWrite writeToFile:filePath atomically:YES encoding:NSUTF8StringEncoding error:NULL];
        } else {
            //TODO
//            NSString* base64Data = [data toString];
//            NSData * valToWrite = [NSData dataFromBase64String:base64Data];
        }
    }
    
}


- (BOOL) exists:(NSString*)filePath {
    return [[NSFileManager defaultManager] fileExistsAtPath:filePath];
}

- (JSValue*) readFile:(NSString*)filePath ofType: (NSString*) type
{
    
    if([_acceptedTypes containsObject:type]) {
         BOOL fileExists = [[NSFileManager defaultManager] fileExistsAtPath:filePath];
        if([type isEqualToString:@"string"]) {
            
            if(fileExists) {
                NSString* val = [NSString stringWithContentsOfFile:filePath encoding:NSUTF8StringEncoding error:NULL];
                return [JSValue valueWithObject:val inContext:[JSContext currentContext]];
            } else {
                DebugNSLog(@"File does not exist at the path provided.");
            }
            
        } else if([type isEqualToString:@"json"]) {
            
            if(fileExists) {
                NSDictionary* val = [[NSString stringWithContentsOfFile:filePath encoding:NSUTF8StringEncoding error:NULL] JSONObject];
                return [JSValue valueWithObject:val inContext:[JSContext currentContext]];
            } else {
                DebugNSLog(@"File does not exist at the path provided.");
            }
        } else {
            //TODO
//            if(fileExists) {
//                NSDictionary* val = [[NSString stringWithContentsOfFile:filePath encoding:NSUTF8StringEncoding error:NULL] JSONObject];
//                return [JSValue valueWithObject:val inContext:[JSContext currentContext]];
//            }
        }
    } else {
     
        DebugNSLog(@"Incorrect File Type Specified. Acceptable types are: string, json or image.");
        
        return nil;
    }
    return nil;
}

@end
